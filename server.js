require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs"); // Menggunakan bcryptjs yang sudah ada di package.json Anda
const multer = require("multer");
const helmet = require("helmet");
const xss = require("xss");
const session = require("express-session");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },

  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Hanya file gambar yang diperbolehkan!"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const app = express();

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,

  message: {
    status: "Gagal",
    pesan: "Terlalu banyak percobaan login. Coba lagi 5 menit lagi.",
  },

  standardHeaders: true,
  legacyHeaders: false,
});

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

app.disable("x-powered-by");

const PORT = process.env.PORT || 3000;

app.use("/uploads", express.static("uploads"));
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "politalk-secret",
    resave: false,
    saveUninitialized: false,

    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
    },
  }),
);

// Menyambungkan file statis HTML, CSS, JS dari folder 'public'
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// KONEKSI DATABASE (MYSQL XAMPP)
// ==========================================
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "politalk_db", // Sesuai nama database Anda
});

db.connect((err) => {
  if (err) {
    console.error("Koneksi database MySQL gagal:", err.message);
    return;
  }
  console.log("Database MySQL XAMPP Berhasil Terhubung!");
});

// ==========================================
// 1. API: REGISTRASI MAHASISWA (REGISTER.HTML)
// ==========================================
app.post("/api/register", async (req, res) => {
  const { nama, nim, email, password } = req.body;

  // Validasi apakah email atau NIM sudah terdaftar sebelumnya
  const sqlCheck = "SELECT email FROM pengguna WHERE email = ? OR nim = ?";
  db.query(sqlCheck, [email, nim], async (err, results) => {
    if (err)
      return res.status(500).json({ status: "Error", pesan: err.message });
    if (results.length > 0) {
      return res
        .status(400)
        .json({ status: "Gagal", pesan: "NIM atau Email sudah terdaftar!" });
    }

    try {
      // Mengamankan password dengan hashing sebelum disimpan ke database
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Simpan user baru dengan password yang sudah di-hash
      const sqlInsert =
        "INSERT INTO pengguna (nama, nim, email, password) VALUES (?, ?, ?, ?)";
      db.query(sqlInsert, [nama, nim, email, hashedPassword], (err, result) => {
        if (err)
          return res.status(500).json({ status: "Error", pesan: err.message });
        res.json({ status: "Sukses", pesan: "Registrasi berhasil!" });
      });
    } catch (hashErr) {
      res
        .status(500)
        .json({ status: "Error", pesan: "Gagal memproses enkripsi." });
    }
  });
});

// ==========================================
// 2. API: AUTENTIKASI MASUK (INDEX.HTML / LOGIN)
// ==========================================
app.post("/api/login", loginLimiter, (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: "Gagal",
      pesan: "Email dan password wajib diisi",
    });
  }

  const sql = "SELECT * FROM pengguna WHERE email = ?";

  db.query(sql, [email], async (err, results) => {
    if (err) {
      return res.status(500).json({
        status: "Error",
        pesan: err.message,
      });
    }

    if (results.length === 0) {
      return res.status(401).json({
        status: "Gagal",
        pesan: "Email atau password salah.",
      });
    }

    const user = results[0];

    if (user.status === "nonaktif") {
      return res.status(403).json({
        status: "Gagal",
        pesan: "Akun Anda telah dinonaktifkan oleh admin",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        status: "Gagal",
        pesan: "Email atau password salah.",
      });
    }

    // Simpan session
    req.session.user = {
      fullname: user.nama,
      nim: user.nim,
      email: user.email,
      role: user.role,
    };

    return res.json({
      status: "Sukses",
      user: req.session.user,
    });
  });
});

// ==========================================
// 3. API: AMBIL PROFIL MAHASISWA (PROFILE.HTML)
// ==========================================
app.get("/api/profile", (req, res) => {
  const email = req.query.email;

  const sql = `
SELECT
  p.nama,
  p.username,
  p.nim,
  p.email,
  p.prodi,
  p.bio,
  p.foto_profil,

  (
    SELECT COUNT(*)
    FROM diskusi d
    WHERE d.email_user = p.email
  ) AS total_post,

  (
    SELECT COUNT(*)
    FROM likes l
    JOIN diskusi d ON d.id_post = l.id_post
    WHERE d.email_user = p.email
  ) AS total_like

FROM pengguna p

WHERE p.email = ?
`;

  db.query(sql, [email], (err, results) => {
    if (err) {
      return res.status(500).json({
        status: "Error",
        pesan: err.message,
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        status: "Gagal",
        pesan: "Data pengguna tidak ditemukan",
      });
    }

    res.json({
      status: "Sukses",
      data: results[0],
    });
  });
});

// ==========================================
// 4. API: UPDATE PROFIL MAHASISWA (PROFILE.HTML)
// ==========================================
app.post("/api/profile/upload-photo", upload.single("foto"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      status: "Error",
      pesan: "Foto tidak ditemukan",
    });
  }

  res.json({
    status: "Sukses",
    path: "/uploads/" + req.file.filename,
  });
});

app.put("/api/profile/update", (req, res) => {
  const { email, nama, nim, prodi, bio } = req.body;

  const sql = `
    UPDATE pengguna
    SET
      nama=?,
      nim=?,
      prodi=?,
      bio=?
    WHERE email=?
  `;

  db.query(sql, [nama, nim, prodi, bio, email], (err) => {
    if (err) {
      return res.status(500).json({
        status: "Gagal",
      });
    }

    res.json({
      status: "Sukses",
      pesan: "Profil berhasil diperbarui",
    });
  });
});

// ==========================================
// 5. API: AMBIL SEMUA POSTINGAN DISKUSI (FEED.HTML)
// ==========================================
app.get("/api/posts", (req, res) => {
  const email = req.query.email;

  const sql = `
SELECT
    diskusi.*,
    pengguna.nama,
    pengguna.nim,
    pengguna.foto_profil,
    pengguna.role,

    COUNT(DISTINCT likes.id_like) AS likes,
    COUNT(DISTINCT komentar.id_komentar) AS total_komentar,

    MAX(
      CASE
        WHEN likes.email_user = ?
        THEN 1
        ELSE 0
      END
    ) AS liked

FROM diskusi

JOIN pengguna
ON diskusi.email_user = pengguna.email

LEFT JOIN likes
ON likes.id_post = diskusi.id_post

LEFT JOIN komentar
ON komentar.id_post = diskusi.id_post



GROUP BY diskusi.id_post

ORDER BY diskusi.dibuat_pada DESC
`;

  db.query(sql, [email], (err, results) => {
    if (err)
      return res.status(500).json({ status: "Error", pesan: err.message });
    res.json({ status: "Sukses", data: results });
  });
});

app.get("/api/profile/posts", (req, res) => {
  const email = req.query.email;

  const sql = `
  SELECT
    diskusi.*,
    pengguna.nama,
    pengguna.nim,

    COUNT(DISTINCT likes.id_like) AS likes,

    COUNT(DISTINCT komentar.id_komentar) AS total_komentar,

    MAX(
      CASE
        WHEN likes.email_user = ?
        THEN 1
        ELSE 0
      END
    ) AS liked

  FROM diskusi
  JOIN pengguna
    ON pengguna.email = diskusi.email_user

  LEFT JOIN likes
    ON likes.id_post = diskusi.id_post

  LEFT JOIN komentar
    ON komentar.id_post = diskusi.id_post

  WHERE diskusi.email_user = ?

  GROUP BY diskusi.id_post

  ORDER BY diskusi.dibuat_pada DESC
  `;

  db.query(sql, [email, email], (err, results) => {
    if (err) {
      return res.status(500).json({
        status: "Error",
        pesan: err.message,
      });
    }

    res.json({
      status: "Sukses",
      data: results,
    });
  });
});

// ==========================================
// 6. API: BUAT POSTINGAN DISKUSI BARU (FEED.HTML)
// ==========================================
app.post("/api/posts", (req, res) => {
  upload.single("gambar")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        status: "Gagal",
        pesan: err.message,
      });
    }

    const email = req.body.email;

    const judul = xss(req.body.judul);
    const konten = xss(req.body.konten);

    const gambar = req.file ? `/uploads/${req.file.filename}` : null;

    const sql =
      "INSERT INTO diskusi (email_user, judul, konten, gambar) VALUES (?, ?, ?, ?)";

    db.query(sql, [email, judul, konten, gambar], (err, result) => {
      if (err) {
        return res.status(500).json({
          status: "Error",
          pesan: err.message,
        });
      }

      res.json({
        status: "Sukses",
        pesan: "Postingan berhasil dibuat",
      });
    });
  });
});

// ==========================================
// 7. API: AMBIL DETAIL SATU POSTINGAN (DETAIL.HTML)
// ==========================================
app.get("/api/posts/:id", (req, res) => {
  const postId = req.params.id;
  const sql = `
        SELECT diskusi.*, pengguna.nama, pengguna.nim 
        FROM diskusi 
        JOIN pengguna ON diskusi.email_user = pengguna.email 
        WHERE diskusi.id_post = ?`;

  db.query(sql, [postId], (err, results) => {
    if (err)
      return res.status(500).json({ status: "Error", pesan: err.message });
    if (results.length === 0)
      return res
        .status(404)
        .json({ status: "Gagal", pesan: "Postingan tidak ditemukan" });
    res.json({ status: "Sukses", data: results[0] });
  });
});

// ==========================================
// 8. API: AMBIL SEMUA KOMENTAR DARI POSTINGAN (DETAIL.HTML)
// ==========================================
app.post("/api/posts/:id/toggle-like", (req, res) => {
  const { email } = req.body;
  const idPost = req.params.id;

  db.query(
    "SELECT * FROM likes WHERE id_post=? AND email_user=?",
    [idPost, email],
    (err, rows) => {
      if (err)
        return res.status(500).json({
          status: "Error",
          pesan: err.message,
        });

      if (rows.length > 0) {
        db.query(
          "DELETE FROM likes WHERE id_post=? AND email_user=?",
          [idPost, email],
          (err2) => {
            if (err2)
              return res.status(500).json({
                status: "Error",
                pesan: err2.message,
              });

            res.json({
              status: "Sukses",
              action: "dislike",
            });
          },
        );
      } else {
        db.query(
          "INSERT INTO likes (id_post, email_user) VALUES (?, ?)",
          [idPost, email],
          (err2) => {
            if (err2)
              return res.status(500).json({
                status: "Error",
                pesan: err2.message,
              });

            res.json({
              status: "Sukses",
              action: "like",
            });
          },
        );
      }
    },
  );
});

// ==========================================
// 9. API: KIRIM KOMENTAR BARU (DETAIL.HTML)
// ==========================================
app.get("/api/posts/:id/comments", (req, res) => {
  const postId = req.params.id;
  const email = req.query.email;

  const sql = `
    SELECT
      komentar.*,
      pengguna.nama,
      pengguna.nim,
      pengguna.role,
      COUNT(DISTINCT like_komentar.id_like) AS total_like,

      MAX(
        CASE
          WHEN like_user.email_user IS NOT NULL
          THEN 1
          ELSE 0
        END
      ) AS liked_comment

    FROM komentar

    JOIN pengguna
    ON komentar.email_user = pengguna.email

    LEFT JOIN like_komentar
    ON komentar.id_komentar = like_komentar.id_komentar

    LEFT JOIN like_komentar AS like_user
    ON komentar.id_komentar = like_user.id_komentar
    AND like_user.email_user = ?

    WHERE komentar.id_post = ?

    GROUP BY komentar.id_komentar

    ORDER BY
  COALESCE(
    komentar.parent_id,
    komentar.id_komentar
  ),
  komentar.dibuat_pada ASC
  `;

  db.query(sql, [email, postId], (err, results) => {
    if (err) {
      return res.status(500).json({
        status: "Error",
        pesan: err.message,
      });
    }

    console.table(
      results.map((r) => ({
        id: r.id_komentar,
        parent_id: r.parent_id,
        isi: r.isi_komentar,
      })),
    );

    res.json({
      status: "Sukses",
      data: results,
    });
  });
});

app.post("/api/posts/:id/comments", (req, res) => {
  const postId = req.params.id;

  const email = req.body.email;
  const isi_komentar = xss(req.body.isi_komentar);
  const parent_id = req.body.parent_id;

  const sql = `
    INSERT INTO komentar
    (
      id_post,
      email_user,
      isi_komentar,
      parent_id
    )
    VALUES (?, ?, ?, ?)
  `;

  db.query(sql, [postId, email, isi_komentar, parent_id || null], (err) => {
    if (err) {
      return res.status(500).json({
        status: "Error",
        pesan: err.message,
      });
    }

    res.json({
      status: "Sukses",
    });
  });
});

app.post("/api/comments/:id/reply", (req, res) => {
  const parentId = req.params.id;

  const { email, isi_komentar } = req.body;

  db.query(
    "SELECT * FROM komentar WHERE id_komentar = ?",
    [parentId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          pesan: err.message,
        });
      }

      if (rows.length === 0) {
        return res.status(404).json({
          pesan: "Komentar tidak ditemukan",
        });
      }

      const parent = rows[0];

      const nextLevel = (parent.level_reply || 0) + 1;
      console.log(
        "PARENT:",
        parent.id_komentar,
        "LEVEL:",
        parent.level_reply,
        "NEXT:",
        nextLevel,
      );

      if (nextLevel > 5) {
        return res.status(400).json({
          pesan: "Maksimal 5 level balasan",
        });
      }

      const sql = `
        INSERT INTO komentar
        (
          id_post,
          email_user,
          isi_komentar,
          parent_id,
          level_reply
        )
        VALUES (?, ?, ?, ?, ?)
      `;

      db.query(
        sql,
        [parent.id_post, email, isi_komentar, parentId, nextLevel],
        (err2) => {
          if (err2) {
            return res.status(500).json({
              pesan: err2.message,
            });
          }

          res.json({
            status: "Sukses",
          });
        },
      );
    },
  );
});
// ==========================================
// LIKE POSTINGAN
// ==========================================

app.patch("/api/posts/:id/like", (req, res) => {
  const postId = req.params.id;

  const sql = `
    UPDATE diskusi
    SET likes = likes + 1
    WHERE id_post = ?
  `;

  db.query(sql, [postId], (err, result) => {
    if (err) {
      return res.status(500).json({
        status: "Error",
        pesan: err.message,
      });
    }

    res.json({
      status: "Sukses",
      pesan: "Like berhasil",
    });
  });
});

app.post("/api/comments/:id/like", (req, res) => {
  const commentId = req.params.id;

  const { email } = req.body;

  const cekSql = `
    SELECT *
    FROM like_komentar
    WHERE id_komentar = ?
    AND email_user = ?
  `;

  db.query(cekSql, [commentId, email], (err, results) => {
    if (err) {
      return res.status(500).json({
        pesan: err.message,
      });
    }

    // SUDAH LIKE -> UNLIKE
    if (results.length > 0) {
      db.query(
        `
          DELETE FROM like_komentar
          WHERE id_komentar = ?
          AND email_user = ?
          `,
        [commentId, email],
        (err2) => {
          if (err2) {
            return res.status(500).json({
              pesan: err2.message,
            });
          }

          res.json({
            status: "unliked",
          });
        },
      );
    }

    // BELUM LIKE -> LIKE
    else {
      db.query(
        `
          INSERT INTO like_komentar
          (
            id_komentar,
            email_user
          )
          VALUES (?, ?)
          `,
        [commentId, email],
        (err2) => {
          if (err2) {
            return res.status(500).json({
              pesan: err2.message,
            });
          }

          res.json({
            status: "liked",
          });
        },
      );
    }
  });
});

// ==========================================
// HAPUS KOMENTAR
// ==========================================

app.delete("/api/comments/:id", (req, res) => {
  const commentId = req.params.id;

  const { email, role } = req.body;

  let sql;
  let params;

  if (role === "admin") {
    sql = `
      DELETE FROM komentar
      WHERE id_komentar = ?
    `;

    params = [commentId];
  } else {
    sql = `
      DELETE FROM komentar
      WHERE id_komentar = ?
      AND email_user = ?
    `;

    params = [commentId, email];
  }

  db.query(sql, params, (err, result) => {
    if (err) {
      return res.status(500).json({
        pesan: err.message,
      });
    }

    if (result.affectedRows === 0) {
      return res.status(403).json({
        pesan: "Anda tidak berhak menghapus komentar ini",
      });
    }

    res.json({
      status: "Sukses",
    });
  });
});

app.delete("/api/posts/:id", (req, res) => {
  const postId = req.params.id;
  const { email, role } = req.body;

  db.query("SELECT * FROM diskusi WHERE id_post = ?", [postId], (err, rows) => {
    if (err) {
      return res.status(500).json({
        pesan: err.message,
      });
    }

    if (rows.length === 0) {
      return res.status(404).json({
        pesan: "Postingan tidak ditemukan",
      });
    }

    const post = rows[0];

    if (role !== "admin" && post.email_user !== email) {
      return res.status(403).json({
        pesan: "Anda tidak berhak menghapus postingan ini",
      });
    }

    // Hapus gambar jika ada
    if (post.gambar) {
      const imagePath = path.join(__dirname, post.gambar.replace(/^\/+/, ""));

      fs.unlink(imagePath, (err) => {
        if (err) {
          console.log("Gagal hapus gambar:", err.message);
        }
      });
    }

    db.query("DELETE FROM diskusi WHERE id_post = ?", [postId], (err2) => {
      if (err2) {
        return res.status(500).json({
          pesan: err2.message,
        });
      }

      res.json({
        status: "Sukses",
      });
    });
  });
});

app.put("/api/posts/:id", (req, res) => {
  const postId = req.params.id;

  const judul = xss(req.body.judul);
  const konten = xss(req.body.konten);

  const email = req.body.email;
  const role = req.body.role;

  let sql;
  let params;

  if (role === "admin") {
    sql = `
      UPDATE diskusi
      SET judul = ?, konten = ?
      WHERE id_post = ?
    `;

    params = [judul, konten, postId];
  } else {
    sql = `
      UPDATE diskusi
      SET judul = ?, konten = ?
      WHERE id_post = ?
      AND email_user = ?
    `;

    params = [judul, konten, postId, email];
  }

  db.query(sql, params, (err, result) => {
    if (err) {
      return res.status(500).json({
        status: "Error",
        pesan: err.message,
      });
    }

    if (result.affectedRows === 0) {
      return res.status(403).json({
        status: "Gagal",
        pesan: "Anda tidak berhak mengedit postingan ini",
      });
    }

    res.json({
      status: "Sukses",
      pesan: "Postingan berhasil diperbarui",
    });
  });
});

app.put("/api/comments/:id", (req, res) => {
  const commentId = req.params.id;

  const isi_komentar = xss(req.body.isi_komentar);
  const email = req.body.email;

  db.query(
    `
    UPDATE komentar
    SET isi_komentar = ?
    WHERE id_komentar = ?
    AND email_user = ?
    `,
    [isi_komentar, commentId, email],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          status: "Error",
          pesan: err.message,
        });
      }

      if (result.affectedRows === 0) {
        return res.status(403).json({
          status: "Gagal",
          pesan: "Bukan komentar milik Anda",
        });
      }

      res.json({
        status: "Sukses",
      });
    },
  );
});

app.put("/api/users/:email/disable", (req, res) => {
  const email = req.params.email;

  db.query(
    `
    UPDATE pengguna
    SET status = 'nonaktif'
    WHERE email = ?
    `,
    [email],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          pesan: err.message,
        });
      }

      res.json({
        status: "Sukses",
        pesan: "Akun berhasil dinonaktifkan",
      });
    },
  );
});

app.put("/api/users/:email/enable", (req, res) => {
  const email = req.params.email;

  db.query(
    `
    UPDATE pengguna
    SET status = 'aktif'
    WHERE email = ?
    `,
    [email],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          pesan: err.message,
        });
      }

      res.json({
        status: "Sukses",
        pesan: "Akun berhasil diaktifkan",
      });
    },
  );
});

app.get("/api/users", (req, res) => {
  db.query(
    `
    SELECT
      nama,
      email,
      role,
      status
    FROM pengguna
    ORDER BY nama
    `,
    (err, results) => {
      if (err) {
        return res.status(500).json({
          pesan: err.message,
        });
      }

      res.json({
        status: "Sukses",
        data: results,
      });
    },
  );
});

app.post("/api/verify-user", (req, res) => {
  const { email, nim } = req.body;

  const sql = `
    SELECT *
    FROM pengguna
    WHERE email = ?
    AND nim = ?
  `;

  db.query(sql, [email, nim], (err, result) => {
    if (err)
      return res.status(500).json({
        status: "Error",
      });

    if (result.length === 0) {
      return res.status(404).json({
        status: "Gagal",
        pesan: "Email atau NIM tidak cocok",
      });
    }

    res.json({
      status: "Sukses",
    });
  });
});

app.put("/api/reset-password", async (req, res) => {
  const { email, passwordBaru } = req.body;

  if (!email || !passwordBaru) {
    return res.status(400).json({
      status: "Gagal",
      pesan: "Data tidak lengkap",
    });
  }

  if (passwordBaru.length < 8) {
    return res.status(400).json({
      status: "Gagal",
      pesan: "Password minimal 8 karakter",
    });
  }

  const hashedPassword = await bcrypt.hash(passwordBaru, 10);

  db.query(
    `
    UPDATE pengguna
    SET password = ?
    WHERE email = ?
    `,
    [hashedPassword, email],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          status: "Error",
          pesan: err.message,
        });
      }

      res.json({
        status: "Sukses",
        pesan: "Password berhasil diubah",
      });
    },
  );
});

// ==========================================
// MENJALANKAN SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
