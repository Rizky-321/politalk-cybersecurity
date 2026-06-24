const API_URL = "http://localhost:3000/api";

let allPosts = [];
let editingPostId = null;
let editingCommentId = null;
let currentProfile = null;

function getActiveUser() {
  const user = localStorage.getItem("userActive");
  if (!user) return null;
  return JSON.parse(user);
}

function generateInitials(name) {
  if (!name) return "??";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}

async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById("login-email").value;

  const password = document.getElementById("login-password").value;

  try {
    const response = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const data = await response.json();

    console.log(data);

    // User wajib MFA
    if (data.status === "MFA_REQUIRED") {
      localStorage.setItem("pendingUser", JSON.stringify(data.user));

      window.location.href = "verify-mfa.html";

      return;
    }

    // Login biasa
    if (response.ok) {
      const userWithInitials = {
        ...data.user,
        initials: generateInitials(data.user.fullname),
      };

      localStorage.setItem("userActive", JSON.stringify(userWithInitials));

      window.location.href = "feed.html";
    } else {
      alert(data.pesan || "Login gagal");
    }
  } catch (err) {
    console.error(err);

    alert("Gagal terhubung ke server");
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const fullname = document.getElementById("reg-fullname").value;
  const email = document.getElementById("reg-email").value;
  const nim = document.getElementById("reg-nim").value;
  const password = document.getElementById("reg-password").value;
  try {
    const response = await fetch(`${API_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nama: fullname,
        email,
        nim,
        password,
      }),
    });
    if (response.ok) {
      alert("Registrasi Berhasil!");
      window.location.href = "index.html";
    } else {
      const error = await response.json();
      alert("Gagal daftar: " + error.pesan);
    }
  } catch (err) {
    console.error(err);
  }
}

async function handleCreatePost(event) {
  event.preventDefault();
  const user = getActiveUser();
  if (!user) return (window.location.href = "index.html");
  const content = document.getElementById("post-content").value;
  const imageInput = document.getElementById("post-image");
  if (!content && (!imageInput || imageInput.files.length === 0)) return;
  if (imageInput && imageInput.files.length > 0) {
    const reader = new FileReader();
    reader.readAsDataURL(imageInput.files[0]);
    reader.onload = async () => {
      await submitToDatabase(user, content, reader.result);
    };
  } else {
    await submitToDatabase(user, content, "");
  }
}

async function submitPost() {
  const user = getActiveUser();

  const judul = document.getElementById("post-title").value.trim();

  const konten = document.getElementById("post-content").value.trim();

  const gambar = document.getElementById("post-image").files[0];

  if (!judul || !konten) {
    alert("Judul dan konten wajib diisi");
    return;
  }

  const formData = new FormData();

  formData.append("email", user.email);
  formData.append("judul", judul);
  formData.append("konten", konten);

  if (gambar) {
    formData.append("gambar", gambar);
  }

  try {
    const res = await fetch(`${API_URL}/posts`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (res.ok) {
      alert("Postingan berhasil dibuat");
      location.reload();
    } else {
      alert(data.pesan);
    }
  } catch (err) {
    console.error(err);
  }
}

// async function submitToDatabase(user, content, imageBase64) {
//   const payload = {
//     author: user.fullname,
//     nim: user.nim,
//     date: new Date().toLocaleString("id-ID"),
//     content: content,
//     image: imageBase64,
//     likes: 0,
//     comments: [],
//   };
//   try {
//     const res = await fetch(`${API_URL}/posts`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(payload),
//     });
//     if (res.ok) {
//       document.getElementById("post-content").value = "";
//       if (document.getElementById("post-image"))
//         document.getElementById("post-image").value = "";
//       loadFeed();
//     }
//   } catch (err) {
//     console.error(err);
//   }
// }

async function handleLike(postId, currentLikes) {
  try {
    await fetch(`${API_URL}/posts/${postId}/like`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ likes: parseInt(currentLikes) + 1 }),
    });
    loadFeed();
  } catch (err) {
    console.error(err);
  }
}

// PERBAIKAN: Menambahkan payload nim ke database saat user berkomentar
async function handleComment(event, postId) {
  if (event.key === "Enter") {
    const user = getActiveUser();
    const text = event.target.value.trim();
    if (!text) return;
    try {
      await fetch(`${API_URL}/posts/${postId}/comment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Ditambahkan nim: user.nim agar komentar punya identitas pemilik
        body: JSON.stringify({
          user: user.fullname,
          nim: user.nim,
          text: text,
        }),
      });
      event.target.value = "";
      loadFeed();
    } catch (err) {
      console.error(err);
    }
  }
}

// FUNGSI BARU: Menghapus Postingan
async function handleDeletePost(postId) {
  console.log("DELETE POST ID:", postId);

  if (confirm("Apakah Anda yakin ingin menghapus postingan ini?")) {
    try {
      const user = getActiveUser();

      const res = await fetch(`${API_URL}/posts/${postId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          role: user.role,
        }),
      });
      const data = await res.json();

      console.log("DELETE RESPONSE:", data);

      if (res.ok) {
        alert("Postingan berhasil dihapus!");
        loadFeed();
      } else {
        alert(data.pesan);
      }
    } catch (err) {
      console.error(err);
    }
  }
}

// FUNGSI BARU: Menghapus Komentar
async function handleDeleteComment(postId, commentId) {
  if (confirm("Apakah Anda yakin ingin menghapus komentar ini?")) {
    try {
      const user = getActiveUser();

      const res = await fetch(
        `${API_URL}/posts/${postId}/comments/${commentId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: user.email,
            role: user.role,
          }),
        },
      );

      const data = await res.json();

      if (res.ok) {
        alert("Komentar berhasil dihapus!");
        loadFeed();
      } else {
        alert(data.pesan);
      }
    } catch (err) {
      console.error(err);
    }
  }
}

// PERBAIKAN: Mengatur Hak Akses Tampilan Tombol Hapus Post & Komen Berdasarkan Akun / Role Admin
async function loadFeed() {
  const container = document.getElementById("feed-container");
  if (!container) return;

  const user = getActiveUser();

  const adminMenu = document.getElementById("admin-menu");

  if (user && user.role === "admin") {
    adminMenu.classList.remove("hidden");
  }
  console.log("USER:", user);
  console.log("ROLE:", user.role);

  try {
    const res = await fetch(`${API_URL}/posts?email=${user.email}`);
    const result = await res.json();
    const posts = result.data || [];

    allPosts = posts;

    console.log(posts);
    console.log(posts[0]);

    console.log("loadFeed jalan");
    console.log(posts);

    const myPosts = posts.filter((p) => p.nim === user.nim);
    const statEl = document.getElementById("user-post-count");
    if (statEl) statEl.innerText = myPosts.length;
    container.innerHTML = `
  </div>
</div>
`;

    posts.forEach((post) => {
      const isMyPost = user && post.nim === user.nim;
      const isAdmin = user && user.role === "admin";

      const imgHtml = post.gambar
        ? `<img src="http://localhost:3000${post.gambar}"
         class="w-full h-auto rounded-3xl my-4 border shadow-sm">`
        : "";
      // HAK AKSES POST: Muncul tombol hapus jika kiriman sendiri ATAU user adalah admin
      let actionButtonsHtml = "";

      if (isMyPost) {
        actionButtonsHtml = `
            <div class="flex gap-2 ml-auto">

              <button
                onclick="openEditPostModal(${post.id_post})"
                class="text-xs font-bold text-blue-500 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl transition"
              >
                ✏️ Edit
              </button>

              <button
                onclick="handleDeletePost('${post.id_post}')"
                class="text-xs font-bold text-red-500 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-xl transition"
              >
                🗑️ Hapus
              </button>

            </div>
          `;
      } else if (isAdmin) {
        actionButtonsHtml = `
            <div class="flex gap-2 ml-auto">

              <button
                onclick="handleDeletePost('${post.id_post}')"
                class="text-xs font-bold text-red-500 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-xl transition"
              >
                🗑️ Hapus
              </button>

            </div>
          `;
      }

      const card = `
      <div class="post-card bg-white p-6 rounded-3xl border border-blue-50 shadow-sm mb-6">

    <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold">
               ${(post.nama || "U")[0].toUpperCase()}
            </div>
            
           <div>
            <h4 class="font-bold text-slate-800 flex items-center gap-2">
          ${post.nama}

          ${
            post.role === "admin"
              ? `
                <span
                  class="bg-yellow-100 text-yellow-700 text-[10px] px-2 py-0.5 rounded-full font-bold"
                >
                  👑 ADMIN
                </span>
              `
              : ""
          }
        </h4>

    <p class="text-xs text-slate-500">
        ${post.nim}
    </p>

    <p class="text-xs text-slate-400">
        ${new Date(post.dibuat_pada).toLocaleString("id-ID")}
    </p>
</div>
        </div>

        ${actionButtonsHtml}
    </div>

    <h3 class="font-bold text-lg text-slate-800 mb-2">
        ${post.judul}
    </h3>

     <p class="text-slate-600">
    ${post.konten}
  </p>

  ${imgHtml}

<div class="flex items-center gap-4 mt-4 mb-4">

  <button
  id="like-btn-${post.id_post}"
  onclick="toggleLike(${post.id_post})"
  class="
    px-4 py-2
    rounded-xl
    font-semibold
    hover:bg-pink-100
    ${post.liked ? "bg-pink-100 text-pink-600" : "bg-slate-100 text-slate-500"}
  "
>
  <span id="like-count-${post.id_post}">
    ${post.likes || 0}
  </span>

  ${post.liked ? "❤️" : "🤍"}
</button>

  <div class="px-4 py-2 bg-slate-50 rounded-xl text-slate-600">
    💬 <span id="comment-count-${post.id_post}">
      ${post.total_komentar || 0}
    </span>
  </div>

</div>

<div class="mt-4 border-t pt-4">

    <div id="comments-${post.id_post}" class="space-y-2 mb-3">
      <p class="text-xs text-slate-400">
        Memuat komentar...
      </p>
    </div>

    <div class="flex gap-2">
      <input
        id="comment-input-${post.id_post}"
        type="text"
        placeholder="Tulis komentar..."
        class="flex-1 border rounded-xl px-3 py-2 text-sm"
      >

      <button
        onclick="submitComment(${post.id_post})"
        class="bg-blue-600 text-white px-4 rounded-xl"
      >
        Kirim
      </button>
    </div>

  </div>

</div>
`;

      container.insertAdjacentHTML("beforeend", card);
      console.log("CARD BERHASIL DITAMBAHKAN");

      loadComments(post.id_post);
    });

    syncStaticUI(user);
  } catch (err) {
    console.error(err);
  }
}

function setupSearch() {
  const searchInput = document.getElementById("global-search");
  console.log("SETUP SEARCH JALAN");

  if (!searchInput) return;

  searchInput.addEventListener("input", function () {
    console.log("KETIK:", this.value);

    const keyword = this.value.toLowerCase().trim();

    const cards = document.querySelectorAll("#feed-container .post-card");

    cards.forEach((card) => {
      const text = card.innerText.toLowerCase();

      if (text.includes(keyword)) {
        card.style.display = "";
      } else {
        card.style.display = "none";
      }
    });
  });
}

function openEditPostModal(postId) {
  const post = allPosts.find((p) => p.id_post == postId);

  if (!post) return;

  editingPostId = postId;

  document.getElementById("edit-post-title").value = post.judul;

  document.getElementById("edit-post-content").value = post.konten;

  document.getElementById("editPostModal").classList.remove("hidden");
}

function closeEditPostModal() {
  document.getElementById("editPostModal").classList.add("hidden");
}

async function savePostEdit() {
  const user = getActiveUser();
  console.log("USER:", user);

  try {
    const judul = document.getElementById("edit-post-title").value;

    const konten = document.getElementById("edit-post-content").value;
    console.log("EDIT POST ID:", editingPostId);
    const res = await fetch(`${API_URL}/posts/${editingPostId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        judul,
        konten,
        email: user.email,
        role: user.role,
      }),
    });

    const result = await res.json();
    console.log("RESULT EDIT POST:", result);

    if (!res.ok) {
      alert(result.pesan);
      return;
    }

    alert("Postingan berhasil diperbarui");

    closeEditPostModal();

    if (window.location.pathname.includes("profile")) {
      loadMyPosts();
    } else {
      loadFeed();
    }
  } catch (err) {
    console.error(err);
  }
}

function openEditCommentModal(commentId, isiKomentar) {
  editingCommentId = commentId;

  document.getElementById("edit-comment-content").value = isiKomentar;

  document.getElementById("editCommentModal").classList.remove("hidden");
}

function closeEditCommentModal() {
  document.getElementById("editCommentModal").classList.add("hidden");
}

async function saveCommentEdit() {
  const user = getActiveUser();

  try {
    const isiKomentar = document.getElementById("edit-comment-content").value;

    const res = await fetch(`${API_URL}/comments/${editingCommentId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        isi_komentar: isiKomentar,
        email: user.email,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      alert(result.pesan);
      return;
    }

    alert("Komentar berhasil diperbarui");

    closeEditCommentModal();

    if (window.location.pathname.includes("profile")) {
      loadMyPosts();
    } else {
      loadFeed();
    }
  } catch (err) {
    console.error(err);
  }
}

function syncStaticUI(user) {
  if (!user) return;

  const nama = user.nama || user.fullname || "User";

  const initials = nama
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  document
    .querySelectorAll(".user-fullname-display, #profile-name")
    .forEach((el) => (el.innerText = nama));

  document
    .querySelectorAll(".user-nim-display, #profile-nim")
    .forEach((el) => (el.innerText = user.nim || "-"));

  document
    .querySelectorAll(".user-initials-display, #profile-avatar")
    .forEach((el) => (el.innerText = initials));

  const sidebarName = document.getElementById("sidebar-user-name");

  if (sidebarName) {
    sidebarName.innerText = nama;
  }

  const sidebarNim = document.getElementById("sidebar-user-nim");

  if (sidebarNim) {
    sidebarNim.innerText = user.nim || "-";
  }

  const headerAvatar = document.getElementById("header-profile-avatar");

  if (headerAvatar) {
    headerAvatar.innerText = initials;
  }
}

function openModal() {
  document.getElementById("createPostModal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("createPostModal").classList.add("hidden");
}

async function toggleLike(postId) {
  const user = getActiveUser();

  try {
    const res = await fetch(`${API_URL}/posts/${postId}/toggle-like`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
      }),
    });

    const result = await res.json();

    const btn = document.getElementById(`like-btn-${postId}`);

    const countEl = document.getElementById(`like-count-${postId}`);

    let currentCount = parseInt(countEl.innerText);

    if (result.action === "like") {
      currentCount++;

      btn.classList.remove("bg-slate-100", "text-slate-500");

      btn.classList.add("bg-pink-100", "text-pink-600");

      btn.innerHTML = `
        <span id="like-count-${postId}">
          ${currentCount}
        </span>
        ❤️
      `;
    } else {
      currentCount--;

      btn.classList.remove("bg-pink-100", "text-pink-600");

      btn.classList.add("bg-slate-100", "text-slate-500");

      btn.innerHTML = `
        <span id="like-count-${postId}">
          ${currentCount}
        </span>
        🤍
      `;
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteComment(commentId, postId) {
  if (!confirm("Hapus komentar ini?")) return;

  try {
    const res = await fetch(`${API_URL}/comments/${commentId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      loadComments(postId);
    }
  } catch (err) {
    console.error(err);
  }
}

function renderComment(comment, comments, postId) {
  const user = getActiveUser();

  let actionButtons = "";

  if (user && user.email === comment.email_user) {
    actionButtons = `
    <button
      onclick="openEditCommentModal(${comment.id_komentar}, '${comment.isi_komentar.replace(/'/g, "\\'")}')"
      class="text-xs text-blue-600 hover:underline"
    >
      Edit
    </button>

    <button
      onclick="deleteComment(${comment.id_komentar}, ${postId})"
      class="text-xs text-red-500 hover:underline"
    >
      Hapus
    </button>
  `;
  } else if (user && user.role === "admin") {
    actionButtons = `
    <button
      onclick="deleteComment(${comment.id_komentar}, ${postId})"
      class="text-xs text-red-500 hover:underline"
    >
      Hapus
    </button>
  `;
  }

  const children = comments.filter((c) => c.parent_id === comment.id_komentar);

  return `
    <div
      style="margin-left:${comment.level_reply * 15}px"
      class="
        bg-slate-50
        rounded-xl
        p-3
        mb-2
      "
    >

      <div class="flex items-start gap-3">

        <div
          class="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold"
        >
          ${(comment.nama || "U")[0].toUpperCase()}
        </div>

        <div class="flex-1">

          <div class="flex items-center gap-2">

            <span class="font-semibold text-sm flex items-center gap-2">
              ${comment.nama}

              ${
                comment.role === "admin"
                  ? `
                  <span
                    class="bg-yellow-100 text-yellow-700 text-[10px] px-2 py-0.5 rounded-full font-bold"
                  >
                    👑 ADMIN
                  </span>
                  `
                  : ""
              }
            </span>

            <span class="text-xs text-slate-400">
              ${new Date(comment.dibuat_pada).toLocaleString("id-ID")}
            </span>

          </div>

          <div class="text-sm text-slate-600 mt-1">
            ${comment.isi_komentar}
          </div>

          <div class="mt-2 flex items-center gap-3">

            <button
              onclick="toggleCommentLike(${comment.id_komentar}, ${postId})"
              class="text-xs text-pink-600 hover:underline"
            >
              ${comment.liked_comment ? "❤️" : "🤍"}
              ${comment.total_like || 0}
            </button>

            ${
              Number(comment.level_reply) < 5
                ? `
                  <button
                    onclick="showReplyBox(${comment.id_komentar}, ${postId})"
                    class="text-xs text-blue-600 hover:underline"
                  >
                    Balas
                  </button>
                `
                : ""
            }

            ${actionButtons}

          </div>

          <div id="reply-box-${comment.id_komentar}"></div>

        </div>

      </div>

      ${children
        .map((child) => renderComment(child, comments, postId))
        .join("")}

    </div>
  `;
}

async function loadComments(postId) {
  try {
    const user = getActiveUser();

    const res = await fetch(
      `${API_URL}/posts/${postId}/comments?email=${user.email}`,
    );

    const result = await res.json();

    const comments = result.data || [];
    console.table(
      comments.map((c) => ({
        id: c.id_komentar,
        parent_id: c.parent_id,
        isi: c.isi_komentar,
      })),
    );

    const container = document.getElementById(`comments-${postId}`);

    if (!container) return;

    const countEl = document.getElementById(`comment-count-${postId}`);

    if (countEl) {
      countEl.innerText = comments.length;
    }

    if (comments.length === 0) {
      container.innerHTML = `
        <p class="text-xs text-slate-400">
          Belum ada komentar
        </p>
      `;
      return;
    }

    const rootComments = comments.filter((c) => !c.parent_id);

    container.innerHTML = rootComments
      .map((comment) => renderComment(comment, comments, postId))
      .join("");
  } catch (err) {
    console.error(err);
  }
}

function showReplyBox(commentId, postId) {
  console.log("BALAS DIKLIK =>", "commentId:", commentId, "postId:", postId);

  const box = document.getElementById(`reply-box-${commentId}`);

  if (!box) {
    console.error("Reply box tidak ditemukan:", commentId);
    return;
  }

  box.innerHTML = `
    <div class="flex gap-2 mt-2 ml-10">

      <input
        id="reply-input-${commentId}"
        type="text"
        placeholder="Tulis balasan..."
        class="flex-1 border rounded-xl px-3 py-2 text-sm"
      >

      <button
        onclick="submitReply(${commentId}, ${postId})"
        class="bg-blue-600 text-white px-3 rounded-xl"
      >
        Kirim
      </button>

    </div>
  `;
}

async function submitReply(commentId, postId) {
  console.log("SUBMIT REPLY =>", "commentId:", commentId, "postId:", postId);

  const user = getActiveUser();

  const input = document.getElementById(`reply-input-${commentId}`);

  if (!input) {
    console.error("Input reply tidak ditemukan:", commentId);
    return;
  }

  const isi = input.value.trim();

  if (!isi) {
    alert("Balasan tidak boleh kosong");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/comments/${commentId}/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        isi_komentar: isi,
      }),
    });

    const data = await res.json();

    console.log("REPLY RESPONSE:", data);

    if (res.ok) {
      await loadComments(postId);
    } else {
      alert(data.pesan || "Gagal mengirim balasan");
    }
  } catch (err) {
    console.error("SUBMIT REPLY ERROR:", err);
  }
}

async function toggleCommentLike(commentId, postId) {
  const user = getActiveUser();

  try {
    const res = await fetch(`${API_URL}/comments/${commentId}/like`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
      }),
    });

    const data = await res.json();

    console.log("LIKE RESPONSE:", data);

    if (res.ok) {
      await loadComments(postId);
    }
  } catch (err) {
    console.error(err);
  }
}

async function submitComment(postId) {
  const user = getActiveUser();

  const input = document.getElementById(`comment-input-${postId}`);

  const isi = input.value.trim();

  if (!isi) return;

  try {
    const res = await fetch(`${API_URL}/posts/${postId}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        isi_komentar: isi,
      }),
    });

    const data = await res.json();

    console.log("POST COMMENT:", data);

    if (!res.ok) {
      alert(data.pesan || "Gagal mengirim komentar");
      return;
    }

    input.value = "";

    await loadComments(postId);
  } catch (err) {
    console.error("Submit Comment Error:", err);
  }
}

async function deleteComment(commentId, postId) {
  const user = getActiveUser();

  const yakin = confirm("Yakin ingin menghapus komentar ini?");

  if (!yakin) return;

  try {
    const res = await fetch(`${API_URL}/comments/${commentId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        role: user.role,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      await loadComments(postId);
    } else {
      alert(data.pesan);
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadProfile() {
  const user = getActiveUser();

  console.log("USER LOGIN:", user);

  if (!user) return;

  try {
    console.log(`${API_URL}/profile?email=${encodeURIComponent(user.email)}`);
    const res = await fetch(`${API_URL}/profile?email=${user.email}`);

    const result = await res.json();

    console.log("HASIL API:", result);

    const profile = result.data;

    document.getElementById("profile-name").innerText = profile.nama;

    document.getElementById("profile-nim").innerText = profile.nim;

    document.getElementById("profile-info-nim").innerText = profile.nim;

    document.getElementById("profile-bio").innerText = profile.bio || "-";

    document.getElementById("profile-major").innerText = profile.prodi || "-";
    document.getElementById("stat-posts").innerText = profile.total_post || 0;

    document.getElementById("stat-upvotes").innerText = profile.total_like || 0;

    document.getElementById("profile-avatar").innerText = profile.nama
      .charAt(0)
      .toUpperCase();

    document.getElementById("header-profile-avatar").innerText = profile.nama
      .charAt(0)
      .toUpperCase();

    loadMyPosts();
  } catch (err) {
    console.error(err);
  }
}

async function loadMyPosts() {
  const user = getActiveUser();

  if (!user) return;

  const container = document.getElementById("profile-posts-container");

  if (!container) return;

  try {
    const res = await fetch(`${API_URL}/profile/posts?email=${user.email}`);

    const result = await res.json();

    const posts = result.data || [];
    allPosts = posts;

    if (posts.length === 0) {
      container.innerHTML = `
        <div class="text-center py-10 text-slate-400">
          Belum ada postingan
        </div>
      `;
      return;
    }

    container.innerHTML = "";

    posts.forEach((post) => {
      const imgHtml = post.gambar
        ? `
          <img
            src="http://localhost:3000${post.gambar}"
            class="w-full h-auto rounded-3xl my-4 border shadow-sm"
          >
        `
        : "";

      const card = `
      <div class="bg-white p-6 rounded-3xl border border-blue-50 shadow-sm mb-6">

        <div class="flex items-center justify-between mb-4">

          <div>
            <h4 class="font-bold text-slate-800">
              ${post.nama}
            </h4>

            <p class="text-xs text-slate-500">
              ${post.nim}
            </p>

            <p class="text-xs text-slate-400">
              ${new Date(post.dibuat_pada).toLocaleString("id-ID")}
            </p>
          </div>

          <div class="flex gap-2">

            <button
              onclick="openEditPostModal(${post.id_post})"
              class="text-xs font-bold text-blue-500 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl"
            >
              ✏️ Edit
            </button>

            <button
              onclick="handleDeletePost('${post.id_post}')"
              class="text-xs font-bold text-red-500 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-xl"
            >
              🗑️ Hapus
            </button>

          </div>

        </div>

        <h3 class="font-bold text-lg text-slate-800 mb-2">
          ${post.judul}
        </h3>

        <p class="text-slate-600">
          ${post.konten}
        </p>

        ${imgHtml}

        <div class="flex items-center gap-4 mt-4 mb-4">

          <button
            id="like-btn-${post.id_post}"
            onclick="toggleLike(${post.id_post})"
            class="
              px-4 py-2
              rounded-xl
              font-semibold
              ${
                post.liked
                  ? "bg-pink-100 text-pink-600"
                  : "bg-slate-100 text-slate-500"
              }
            "
          >
            <span id="like-count-${post.id_post}">
              ${post.likes || 0}
            </span>

            ${post.liked ? "❤️" : "🤍"}
          </button>

          <div
            class="px-4 py-2 bg-slate-50 rounded-xl text-slate-600"
          >
            💬
            <span id="comment-count-${post.id_post}">
              ${post.total_komentar || 0}
            </span>
          </div>

        </div>

        <div class="mt-4 border-t pt-4">

          <div
            id="comments-${post.id_post}"
            class="space-y-2 mb-3"
          >
            <p class="text-xs text-slate-400">
              Memuat komentar...
            </p>
          </div>

          <div class="flex gap-2">

            <input
              id="comment-input-${post.id_post}"
              type="text"
              placeholder="Tulis komentar..."
              class="flex-1 border rounded-xl px-3 py-2 text-sm"
            >

            <button
              onclick="submitComment(${post.id_post})"
              class="bg-blue-600 text-white px-4 rounded-xl"
            >
              Kirim
            </button>

          </div>

        </div>

      </div>
      `;

      container.insertAdjacentHTML("beforeend", card);

      loadComments(post.id_post);
    });
  } catch (err) {
    console.error(err);
  }
}

function openProfileModal() {
  document.getElementById("editProfileModal").classList.remove("hidden");

  const user = getActiveUser();

  document.getElementById("editNama").value =
    document.getElementById("profile-name").innerText;

  document.getElementById("editNim").value =
    document.getElementById("profile-nim").innerText;

  document.getElementById("editBio").value =
    document.getElementById("profile-bio").innerText;

  document.getElementById("editProdi").value =
    document.getElementById("profile-major").innerText;
}

function closeProfileModal() {
  document.getElementById("editProfileModal").classList.add("hidden");
}

async function saveProfile() {
  const user = getActiveUser();

  const nama = document.getElementById("editNama").value;

  const nim = document.getElementById("editNim").value;

  const prodi = document.getElementById("editProdi").value;

  const bio = document.getElementById("editBio").value;

  try {
    const res = await fetch(`${API_URL}/profile/update`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        nama,
        nim,
        prodi,
        bio,
      }),
    });

    const result = await res.json();

    alert(result.pesan);

    closeProfileModal();

    loadProfile();
  } catch (err) {
    console.error(err);
  }
}

function confirmLogout() {
  const yakin = confirm("Yakin ingin logout?");

  if (yakin) {
    localStorage.removeItem("userActive");
    window.location.href = "index.html";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadFeed();
  setupSearch();
});

async function loadUsers() {
  const container = document.getElementById("user-container");

  if (!container) return;

  const res = await fetch(`${API_URL}/users`);
  const result = await res.json();

  const users = result.data;

  container.innerHTML = "";

  users.forEach((user) => {
    const card = `
<tr class="border-b hover:bg-slate-50">

  <td class="px-6 py-4 font-semibold">
    ${user.nama}
  </td>

  <td class="px-6 py-4">
    ${user.email}
  </td>

  <td class="px-6 py-4">

    ${
      user.role === "admin"
        ? `
        <span class="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold">
          👑 ADMIN
        </span>
        `
        : `
        <span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">
          USER
        </span>
        `
    }

  </td>

  <td class="px-6 py-4">

    ${
      user.status === "aktif"
        ? `
        <span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">
          Aktif
        </span>
        `
        : `
        <span class="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">
          Nonaktif
        </span>
        `
    }

  </td>

  <td class="px-6 py-4 text-center">

    ${
      user.role !== "admin"
        ? user.status === "aktif"
          ? `
            <button
              onclick="disableUser('${user.email}')"
              class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg"
            >
              Nonaktifkan
            </button>
          `
          : `
            <button
              onclick="enableUser('${user.email}')"
              class="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg"
            >
              Aktifkan
            </button>
          `
        : "-"
    }

  </td>

</tr>
`;

    container.insertAdjacentHTML("beforeend", card);
  });
}

function setupAdminMenu() {
  const user = getActiveUser();

  const menu = document.getElementById("admin-menu");

  if (!menu) return;

  if (user.role === "admin") {
    menu.classList.remove("hidden");
  }
}

async function disableUser(email) {
  if (!confirm("Nonaktifkan akun ini?")) return;

  const res = await fetch(`${API_URL}/users/${email}/disable`, {
    method: "PUT",
  });

  const result = await res.json();

  alert(result.pesan);

  loadUsers();
}

async function enableUser(email) {
  if (!confirm("Aktifkan akun ini?")) return;

  const res = await fetch(`${API_URL}/users/${email}/enable`, {
    method: "PUT",
  });

  const result = await res.json();

  alert(result.pesan);

  loadUsers();
}

function protectAdminPage() {
  const user = getActiveUser();

  if (!window.location.pathname.includes("admin-users.html")) {
    return;
  }

  if (!user || user.role !== "admin") {
    alert("Akses ditolak");

    window.location.href = "feed.html";
  }
}

async function verifyUser() {
  const email = document.getElementById("email").value;

  const nim = document.getElementById("nim").value;

  const res = await fetch(`${API_URL}/verify-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      nim,
    }),
  });

  const data = await res.json();

  if (res.ok) {
    localStorage.setItem("resetEmail", email);

    window.location.href = "reset-password.html";
  } else {
    alert(data.pesan);
  }
}

async function resetPassword() {
  const passwordBaru = document.getElementById("passwordBaru").value;

  const konfirmasiPassword =
    document.getElementById("konfirmasiPassword").value;

  if (passwordBaru !== konfirmasiPassword) {
    alert("Konfirmasi password tidak cocok");
    return;
  }

  const email = localStorage.getItem("resetEmail");

  const res = await fetch(`${API_URL}/reset-password`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      passwordBaru,
    }),
  });

  const data = await res.json();

  if (res.ok) {
    alert("Password berhasil diperbarui");

    localStorage.removeItem("resetEmail");

    window.location.href = "index.html";
  } else {
    alert(data.pesan);
  }
}

function togglePassword(inputId, eyeId) {
  const input = document.getElementById(inputId);
  const eye = document.getElementById(eyeId);

  if (input.type === "password") {
    input.type = "text";
    eye.innerHTML = "🙈";
  } else {
    input.type = "password";
    eye.innerHTML = "👁️";
  }
}

async function enableMFA() {
  const user = JSON.parse(localStorage.getItem("userActive"));

  try {
    const response = await fetch("http://localhost:3000/api/mfa/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
      }),
    });

    const data = await response.json();

    if (data.status === "Sukses") {
      const newWindow = window.open();

      newWindow.document.write(`
        <html>
        <head>
          <title>Aktivasi MFA</title>
        </head>
        <body style="
          font-family:sans-serif;
          text-align:center;
          padding:30px;
        ">
          <h2>Scan QR Code Berikut</h2>

          <img
            src="${data.qrCode}"
            width="300"
          />

          <p>
            Scan menggunakan
            Google Authenticator
          </p>
        </body>
        </html>
      `);
    } else {
      alert(data.pesan);
    }
  } catch (err) {
    console.error(err);

    alert("Gagal membuat MFA");
  }
}

async function checkMFAStatus() {
  const user = JSON.parse(localStorage.getItem("userActive"));

  if (!user) return;

  try {
    const response = await fetch(`${API_URL}/mfa/status/${user.email}`);

    const data = await response.json();

    const status = document.getElementById("mfa-status");
    const enableBtn = document.getElementById("btn-enable-mfa");
    const disableBtn = document.getElementById("btn-disable-mfa");

    // Untuk modal ganti password
    const otpSection = document.getElementById("otpSection");

    if (data.enabled) {
      status.innerText = "MFA : Aktif ✅";
      status.className = "text-sm font-bold text-green-600";

      enableBtn.classList.add("hidden");
      disableBtn.classList.remove("hidden");

      // Tampilkan OTP di modal ganti password
      if (otpSection) {
        otpSection.classList.remove("hidden");
      }
    } else {
      status.innerText = "MFA : Tidak Aktif ❌";
      status.className = "text-sm font-bold text-red-500";

      enableBtn.classList.remove("hidden");
      disableBtn.classList.add("hidden");

      // Sembunyikan OTP di modal ganti password
      if (otpSection) {
        otpSection.classList.add("hidden");
      }
    }
  } catch (err) {
    console.error("MFA Status Error:", err);
  }
}

async function disableMFA() {
  const otp = prompt("Masukkan OTP Google Authenticator");

  if (!otp) return;

  const user = JSON.parse(localStorage.getItem("userActive"));

  try {
    const response = await fetch(`${API_URL}/mfa/disable`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        token: otp,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      alert("MFA berhasil dinonaktifkan");

      checkMFAStatus();
    } else {
      alert(data.pesan);
    }
  } catch (err) {
    console.error(err);
  }
}

function openChangePasswordModal() {
  const modal = document.getElementById("changePasswordModal");

  modal.classList.remove("hidden");
  modal.classList.add("flex");

  checkMFAStatus();
}

function closeChangePasswordModal() {
  const modal = document.getElementById("changePasswordModal");

  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

async function submitChangePassword() {
  const user = JSON.parse(localStorage.getItem("userActive"));

  const currentPassword = document.getElementById("oldPassword").value;

  const newPassword = document.getElementById("newPassword").value;

  const confirmPassword = document.getElementById("confirmPassword").value;

  if (newPassword !== confirmPassword) {
    alert("Konfirmasi password tidak sama");
    return;
  }

  try {
    const response = await fetch(`${API_URL}/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        currentPassword,
        newPassword,
      }),
    });

    const data = await response.json();

    alert(data.pesan);

    if (data.status === "Sukses") {
      closeChangePasswordModal();
    }
  } catch (err) {
    console.error(err);
    alert("Terjadi kesalahan");
  }
}

async function loadEvents() {
  try {
    const response = await fetch("http://localhost:3000/api/events");

    const events = await response.json();

    console.log(events);

    const container = document.getElementById("event-container");

    if (!container) return;

    container.innerHTML = "";

    if (events.length === 0) {
      container.innerHTML = `
        <div
          class="
          bg-white
          rounded-3xl
          p-10
          text-center
          shadow
        ">
          <h2
            class="
            text-2xl
            font-bold
            text-slate-700
          ">
            Belum Ada Event
          </h2>

          <p
            class="
            text-slate-500
            mt-2
          ">
            Jadilah yang pertama membuat event 🎉
          </p>
        </div>
      `;

      return;
    }

    events.forEach((event) => {
      const poster = event.gambar
        ? `
          <img
            src="http://localhost:3000/uploads/events/${event.gambar}"
            alt="${event.judul}"
            class="w-full h-full object-cover"
          >
        `
        : `
          <div
            class="
              w-full h-full
              flex items-center justify-center
              bg-slate-100 text-slate-400
            "
          >
            Tidak ada poster
          </div>
        `;

      const kategoriColor = {
        Seminar: "bg-blue-100 text-blue-700",
        Workshop: "bg-orange-100 text-orange-700",
        Kompetisi: "bg-purple-100 text-purple-700",
        Olahraga: "bg-green-100 text-green-700",
      };

      container.innerHTML += `
      
      <div
        class="
          bg-white
          rounded-3xl
          shadow-lg
          hover:shadow-2xl
          transition-all
          duration-300
          overflow-hidden
          flex
          border
          border-slate-100
        "
      >

        <!-- POSTER -->
        <div
          class="
            w-[300px]
            h-[230px]
            flex-shrink-0
            overflow-hidden
          "
        >
          ${poster}
        </div>

        <!-- CONTENT -->
        <div
          class="
            flex-1
            p-6
            flex
            justify-between
          "
        >

          <!-- KIRI -->
          <div class="flex-1">

            <span
              class="
                inline-block
                px-3
                py-1
                rounded-full
                text-xs
                font-semibold
                mb-3
                ${kategoriColor[event.kategori] || "bg-slate-100 text-slate-700"}
              "
            >
              ${event.kategori || "Event Kampus"}
            </span>

            <h2
              class="
                text-3xl
                font-bold
                text-slate-900
                mb-2
              "
            >
              ${event.judul}
            </h2>

            <p
              class="
                text-slate-600
                mb-4
              "
            >
              ${event.deskripsi}
            </p>

            <div class="space-y-2">

              <div class="flex items-center gap-2 text-slate-600">
                📅
                <span>
                  ${event.tanggal ? event.tanggal.split("T")[0] : "-"}
                </span>
              </div>

              <div class="flex items-center gap-2 text-slate-600">
                🕒
                <span>
                  ${event.jam_mulai || "--:--"}
                  -
                  ${event.jam_selesai || "--:--"}
                </span>
              </div>

              <div class="flex items-center gap-2 text-slate-600">
                📍
                <span>
                  ${event.lokasi}
                </span>
              </div>

              <div class="flex items-center gap-2 text-slate-500 text-sm">
                👤
                <span>
                  ${event.creator_email}
                </span>
              </div>

            </div>

          </div>

          <!-- KANAN -->
          <div
            class="
              flex
              flex-col
              justify-between
              items-end
            "
          >

            <div
              class="
                border
                border-blue-300
                bg-blue-50
                text-blue-700
                px-5
                py-2
                rounded-xl
                font-semibold
              "
            >
              👥 ${event.total_peserta || 0} Peserta
            </div>

            <button
              onclick="joinEvent(${event.id})"
              class="
                bg-gradient-to-r
                from-blue-600
                to-indigo-600
                text-white
                px-8
                py-3
                rounded-xl
                font-semibold
                shadow-lg
                hover:scale-105
                transition
              "
            >
              Ikuti Event
            </button>

          </div>

        </div>

      </div>

      `;
    });
  } catch (error) {
    console.error("Gagal load event:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.location.pathname.includes("event.html")) {
    loadEvents();
  }
});

function openCreateEventModal() {
  const modal = document.getElementById("createEventModal");

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeCreateEventModal() {
  const modal = document.getElementById("createEventModal");

  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

async function submitEvent() {
  try {
    const user = JSON.parse(localStorage.getItem("userActive"));

    if (!user) {
      alert("Silakan login terlebih dahulu");
      return;
    }

    const judul = document.getElementById("eventTitle").value;
    const deskripsi = document.getElementById("eventDescription").value;
    const kategori = document.getElementById("eventCategory").value;

    const tanggal = document.getElementById("eventDate").value;

    const jam_mulai = document.getElementById("eventStartTime").value;

    const jam_selesai = document.getElementById("eventEndTime").value;

    const lokasi = document.getElementById("eventLocation").value;

    const gambar = document.getElementById("eventImage").files[0];

    if (!judul || !deskripsi || !tanggal || !lokasi) {
      alert("Semua field wajib diisi");
      return;
    }

    const formData = new FormData();

    formData.append("creator_email", user.email);

    formData.append("judul", judul);
    formData.append("deskripsi", deskripsi);
    formData.append("kategori", kategori);

    formData.append("tanggal", tanggal);

    formData.append("jam_mulai", jam_mulai);

    formData.append("jam_selesai", jam_selesai);

    formData.append("lokasi", lokasi);

    if (gambar) {
      formData.append("gambar", gambar);
    }

    const response = await fetch("http://localhost:3000/api/events", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    alert(result.message);

    closeCreateEventModal();

    loadEvents();
  } catch (error) {
    console.error(error);
    alert("Gagal membuat event");
  }
}

async function joinEvent(eventId) {
  try {
    const user = JSON.parse(localStorage.getItem("userActive"));

    if (!user) {
      alert("Silakan login terlebih dahulu");
      return;
    }

    const response = await fetch(
      `http://localhost:3000/api/events/${eventId}/join`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          email: user.email,
        }),
      },
    );

    const result = await response.json();

    alert(result.message);
  } catch (error) {
    console.error(error);

    alert("Gagal mengikuti event");
  }
}

console.log("script loaded");
console.log("SEBELUM LOADFEED");

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage();
  loadUsers();
});

loadFeed();
setupAdminMenu();

console.log("SESUDAH LOADFEED");

if (window.location.pathname.includes("profile")) {
  loadProfile();
  checkMFAStatus();
}
