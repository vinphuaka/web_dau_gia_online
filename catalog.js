import { db } from './firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

let allProducts = [];
let activeProductTimers = {}; // Store timers for product catalog
let activeLiveTimers = {};    // Store timers for live auctions

document.addEventListener("DOMContentLoaded", async () => {
  const productCatalog = document.querySelector(".product-catalog");
  const liveAuctionGrid = document.querySelector(".live-auction-grid");
  const searchInput = document.getElementById("search-input");
  const suggestionsContainer = document.getElementById("search-suggestions");
  const searchLoader = document.getElementById("search-loader");
  const searchButton = document.getElementById("search-button");
  let searchTimeout;
  let heroTimerInstance = null;
  let currentCategory = "all";

  // Kiểm tra an toàn cho LocalStorage
  let userProducts = [];
  try {
      userProducts = window.Utils.getFromStorage("user_added_products") || [];
      if (!Array.isArray(userProducts)) userProducts = [];
  } catch (err) {
      console.error("❌ Lỗi đọc dữ liệu local:", err);
      userProducts = [];
  }
  let isInitialLoad = true;

  // Khởi tạo danh sách sản phẩm chỉ với dữ liệu người dùng đăng (nếu có)
  allProducts = [...userProducts];

  // Hàm hiển thị Skeleton ban đầu
  function showSkeletons() {
    const skeletonHTML = `
        <div class="product-card skeleton">
            <div class="product-image-thumbnail skeleton-img"></div>
            <div class="product-details">
                <div class="skeleton-title skeleton"></div>
                <div class="skeleton-text skeleton" style="width: 60%"></div>
                <div class="card-footer">
                    <div class="skeleton-text skeleton" style="width: 40%"></div>
                    <div class="skeleton-btn skeleton"></div>
                </div>
            </div>
        </div>
    `;
    productCatalog.innerHTML = skeletonHTML.repeat(8);
    if (liveAuctionGrid) liveAuctionGrid.innerHTML = skeletonHTML.repeat(3);
  }

  // Hiển thị skeleton ngay lập tức
  showSkeletons();

  function renderProductCard(product) {
    const categoryMap = {
      electronics: "Điện tử",
      fashion: "Thời trang",
      watch: "Đồng hồ",
      art: "Nghệ thuật",
      antiques: "Đồ cổ",
      home: "Gia dụng",
      "classic-car": "Xe cổ"
    };
    const displayCat = categoryMap[product.category] || product.category || "Chung";
    const bidCount = product.history ? product.history.length : 0;

    const tagsHTML = (product.tags || []).map(tag => {
      const style = window.Utils.getTagStyle(tag);
      return `<span style="background: ${style.bg}; color: ${style.text}; font-size: 0.65rem; padding: 2px 8px; border-radius: 10px; font-weight: 600;">#${tag}</span>`;
    }).join('');

    const card = document.createElement("div");
    card.classList.add("product-card");

    card.innerHTML = `
            <div class="product-image-thumbnail">
                <div class="card-badges">
                    <span class="badge-live">LIVE</span>
                    <span class="badge-cat">${displayCat}</span>
                </div>
                <button class="wishlist-btn-card"><i class="fa-regular fa-heart"></i></button>
                <img src="${product.imageUrl}" alt="${product.name}">
                <div class="timer-overlay">
                    <i class="fa-regular fa-clock"></i>
                    <span class="product-timer" data-id="${product.id}">--:--:--</span>
                </div>
            </div>
            <div class="product-details">
                <h3>${product.name}</h3>
                <div class="product-tags" style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;">${tagsHTML}</div>
                <p class="bids-count"><i class="fa-solid fa-users"></i> ${bidCount} lượt đấu giá</p>
                <div class="card-footer">
                    <div class="price-info">
                        <span class="price-label">Giá hiện tại</span>
                        <strong class="current-price">${window.Utils.formatCurrency(product.currentPrice || 0)}</strong>
                    </div>
                    <a href="product-detail.html?id=${product.id}" class="place-bid-btn">Đặt Giá</a>
                </div>
            </div>
        `;
    return card;
  }

  function renderLiveCard(product) {
    const categoryMap = {
      electronics: "Điện tử",
      fashion: "Thời trang",
      watch: "Đồng hồ",
      art: "Nghệ thuật",
      antiques: "Đồ cổ",
      home: "Gia dụng",
      "classic-car": "Xe cổ"
    };
    const displayCat = categoryMap[product.category] || product.category || "Chung";
    const bidCount = product.history ? product.history.length : 0; // Although not used in live card, good to have consistent data

    const card = document.createElement("div");
    card.classList.add("product-card", "live-card");

    const viewers = product.viewers || Math.floor(Math.random() * 500) + 100;
    const topBidderName = product.topBidder?.name || "Chưa có lượt đặt";
    const topBidderAvatar = product.topBidder?.avatar || "https://i.pravatar.cc/150?u=default";
    const increment = product.minIncrement || product.increment || 100000;

    const tagsHTML = (product.tags || []).map(tag => {
      const style = window.Utils.getTagStyle(tag);
      return `<span style="background: ${style.bg}; color: ${style.text}; font-size: 0.65rem; padding: 2px 8px; border-radius: 10px; font-weight: 600;">#${tag}</span>`;
    }).join('');

    card.innerHTML = `
            <div class="product-image-thumbnail">
                <div class="viewer-count">
                    <i class="fa-solid fa-eye"></i> ${viewers}
                </div>
                <div class="card-badges">
                    <span class="badge-live">LIVE</span>
                    <span class="badge-cat">${displayCat}</span>
                </div>
                <img src="${product.imageUrl}" alt="${product.name}">
            </div>
            <div class="product-details">
                <h3>${product.name}</h3>
                <div class="product-tags" style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;">${tagsHTML}</div>
                <div class="top-bidder">
                    <img src="${topBidderAvatar}" class="bidder-avatar">
                    <div class="bidder-info">
                        <span>Người dẫn đầu</span>
                        <strong>${topBidderName}</strong>
                    </div>
                </div>
                <div class="price-info" style="margin: 15px 0;">
                    <span class="price-label">Giá hiện tại</span>
                    <strong class="current-price" style="font-size: 1.4rem;">${window.Utils.formatCurrency(product.currentPrice || 0)}</strong>
                    <div class="bid-increment"><i class="fa-solid fa-arrow-up"></i> +${window.Utils.formatCurrency(increment || 0)}</div>
                </div>
                <div class="card-footer" style="flex-direction: column; align-items: flex-start; gap: 10px;">
                    <span class="live-timer" data-id="${product.id}">--:--:--</span>
                    <a href="product-detail.html?id=${product.id}" class="place-bid-btn" style="width: 100%; text-align: center; background-color: var(--primary);">Tham Gia Đấu Giá</a>
                </div>
            </div>
        `;
    return card;
  }

  function displayProducts(productsToDisplay) {
    // Clear existing product timers to prevent memory leaks and incorrect updates
    Object.values(activeProductTimers).forEach(timer => timer.stop());
    activeProductTimers = {};

    productCatalog.innerHTML = "";
    productsToDisplay.forEach((product) => {
      const card = renderProductCard(product);
      productCatalog.appendChild(card);

      const timerDisplayElement = card.querySelector(`.product-timer[data-id="${product.id}"]`);
      if (timerDisplayElement) {
        if (typeof window.AuctionTimer !== 'function') {
            timerDisplayElement.innerText = "Đang tải...";
            // Thử lại sau 0.5s nếu Timer chưa sẵn sàng
            setTimeout(() => applyFilters(), 500);
            return; 
        }

        const timeData = window.Utils.calculateRemainingTime(product);
        const timer = new window.AuctionTimer(
          timeData.seconds,
          (timeStr) => {
            timerDisplayElement.innerText = timeData.isComingSoon ? `Chờ: ${timeStr}` : timeStr;
          },
          () => {
            if (timerDisplayElement) timerDisplayElement.innerText = "KẾT THÚC";
            const bidBtn = card.querySelector(".place-bid-btn");
            if (bidBtn) {
                bidBtn.style.opacity = "0.5";
                bidBtn.innerText = "Đã đóng";
                bidBtn.style.pointerEvents = "none"; // Disable click functionality
            }
          },
        );
        timer.start();
        activeProductTimers[product.id] = timer; // Store the timer instance
      }
    });
  }

  function displayLiveAuctions(productsToDisplay = []) {
    if (!liveAuctionGrid) return;
    liveAuctionGrid.innerHTML = "";

    // Clear existing live auction timers
    Object.values(activeLiveTimers).forEach(timer => timer.stop());
    activeLiveTimers = {};

    productsToDisplay.forEach((product) => {
      const card = renderLiveCard(product);
      liveAuctionGrid.appendChild(card);

      const timerElem = card.querySelector(`.live-timer[data-id="${product.id}"]`);
      if (timerElem) {
        if (typeof window.AuctionTimer !== 'function') {
            timerElem.innerText = "Đang tải...";
            return;
        }
        
        if (product.timeRemainingSeconds <= 0) {
            timerElem.innerText = "PHIÊN KẾT THÚC";
            return;
        }

        const timeData = window.Utils.calculateRemainingTime(product);
        const timer = new window.AuctionTimer(
          timeData.seconds,
          (time) => {
            if (timerElem) timerElem.innerText = timeData.isComingSoon ? `Bắt đầu sau: ${time}` : `Kết thúc trong: ${time}`;
          },
          () => {
            if (timerElem) timerElem.innerText = "PHIÊN KẾT THÚC";
            const bidBtn = card.querySelector(".place-bid-btn");
            if (bidBtn) bidBtn.style.pointerEvents = "none"; // Disable click functionality
          },
        );
        timer.start();
        activeLiveTimers[product.id] = timer;
      }
    });
  }

  function applyFilters() {
    const search = (searchInput.value || "").toLowerCase().trim().replace(/^#/, "");
    const filtered = allProducts.filter(
      (p) =>
        (currentCategory === "all" || p.category === currentCategory) &&
        (p.name.toLowerCase().includes(search) || 
         (p.tags && p.tags.some(t => t.toLowerCase().includes(search))))
    );
    displayProducts(filtered);
  }

  // Lắng nghe sự kiện click trên các mục của dropdown danh mục
  document.querySelectorAll(".dropdown-content a").forEach(link => {
    link.addEventListener("click", (e) => {
      const cat = e.target.getAttribute("data-category");
      if (cat) {
        e.preventDefault();
        currentCategory = cat;
        applyFilters();
      }
    });
  });

  // Thay đổi: Khi nhấn nút kính lúp, chuyển hướng sang trang products.html kèm từ khóa
  searchButton.addEventListener("click", () => {
    const query = (searchInput.value || "").trim();
    if (query) {
      const progressBar = document.createElement('div');
      progressBar.className = 'page-progress';
      document.body.appendChild(progressBar);
      setTimeout(() => progressBar.style.width = '70%', 10);

      document.body.classList.add('page-loading');
      setTimeout(() => {
        window.location.href = `products.html?search=${encodeURIComponent(query)}`;
      }, 350); // Đợi hiệu ứng CSS hoàn tất (0.35s < 0.4s)
    }
  });

  searchInput.addEventListener("input", () => {
    const query = (searchInput.value || "").toLowerCase().trim();

    if (searchLoader) searchLoader.style.display = "block";

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      applyFilters();

      if (query.length < 2) {
        suggestionsContainer.style.display = "none";
        if (searchLoader) searchLoader.style.display = "none";
        return;
      }

      // Hàm hỗ trợ làm nổi bật văn bản
      const highlightText = (text, q) => {
        const regex = new RegExp(`(${q})`, 'gi');
        return text.replace(regex, '<span class="highlight">$1</span>');
      };

      const matches = allProducts.filter(p =>
        p.name.toLowerCase().includes(query) ||
        (p.tags && p.tags.some(t => t.toLowerCase().includes(query)))
      ).slice(0, 6); // Lấy tối đa 6 gợi ý

      if (matches.length > 0) {
        suggestionsContainer.innerHTML = matches.map(p => `
          <div class="suggestion-item" data-id="${p.id}">
            <img src="${p.imageUrl}" alt="${p.name}">
            <div class="suggestion-info">
              <h4>${highlightText(p.name, query)}</h4>
              <p>${window.Utils.formatCurrency(p.currentPrice)}</p>
            </div>
          </div>
        `).join('');
        suggestionsContainer.style.display = "block";

        // Gán sự kiện click cho từng item trong gợi ý
        suggestionsContainer.querySelectorAll('.suggestion-item').forEach(item => {
          item.onclick = () => {
            const progressBar = document.createElement('div');
            progressBar.className = 'page-progress';
            document.body.appendChild(progressBar);
            setTimeout(() => progressBar.style.width = '70%', 10);

            document.body.classList.add('page-loading');
            setTimeout(() => {
              window.location.href = `product-detail.html?id=${item.dataset.id}`;
            }, 350);
          };
        });
      } else {
        suggestionsContainer.style.display = "none";
      }

      if (searchLoader) searchLoader.style.display = "none";
    }, 300);
  });

  // Đóng danh sách gợi ý khi click ra ngoài
  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
      suggestionsContainer.style.display = "none";
    }
  });

  function updateHeroSection(product) {
    if (!product) return;

    const heroImg = document.querySelector(".hero-visual .featured-img img");
    const heroTitle = document.querySelector(".hero-visual .featured-details h3");
    const heroBids = document.querySelector(".hero-visual .featured-meta span:first-child");
    const heroPrice = document.querySelector(".hero-visual .featured-price strong");
    const heroTimer = document.getElementById("hero-timer");
    const heroCard = document.querySelector(".hero-visual .featured-card");

    if (heroImg) {
      heroImg.src = product.imageUrl;
      heroImg.alt = product.name;
    }
    if (heroTitle) heroTitle.innerText = product.name;
    if (heroBids) heroBids.innerText = `${product.history ? product.history.length : 0} Lượt đấu giá`;
    if (heroPrice) heroPrice.innerText = window.Utils.formatCurrency(product.currentPrice || 0);

    if (heroTimer && typeof window.AuctionTimer === 'function') {
      if (heroTimerInstance) heroTimerInstance.stop();
      const timeData = window.Utils.calculateRemainingTime(product);
      heroTimerInstance = new window.AuctionTimer(
        timeData.seconds,
        (time) => { heroTimer.innerText = timeData.isComingSoon ? `Chờ: ${time}` : time; },
        () => { heroTimer.innerText = "KẾT THÚC"; }
      );
      heroTimerInstance.start();
    }

    if (heroCard) {
      heroCard.style.cursor = "pointer";
      heroCard.onclick = () => window.location.href = `product-detail.html?id=${product.id}`;
    }
  }

  function pickAndDisplayHeroProduct() {
    if (allProducts.length === 0) return;

    const now = Date.now();
    const lastUpdate = Number(localStorage.getItem("hero_last_update") || 0);
    const storedHeroId = localStorage.getItem("hero_product_id");
    const TEN_MINUTES = 10 * 60 * 1000;

    let selectedProduct = allProducts.find(p => p.id === storedHeroId);

    if (!lastUpdate || !selectedProduct || (now - lastUpdate > TEN_MINUTES)) {
      selectedProduct = allProducts[Math.floor(Math.random() * allProducts.length)];
      localStorage.setItem("hero_last_update", now);
      localStorage.setItem("hero_product_id", selectedProduct.id);
    }

    updateHeroSection(selectedProduct);
  }

  function showToast(product) { // Thêm tham số 'product' để có thể truy cập ID
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <div class="toast-icon"><i class="fa-solid fa-bell"></i></div>
      <div class="toast-content">
        <h4>Sản phẩm mới vừa đăng!</h4>
        <p>${product.name}</p>
      </div>
    `;

    // Thêm sự kiện click để chuyển hướng đến trang chi tiết sản phẩm
    toast.addEventListener('click', () => {
      window.location.href = `product-detail.html?id=${product.id}`;
    });

    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  // Cập nhật hàm onSnapshot để truyền cả ID của sản phẩm vào showToast
  onSnapshot(collection(db, "products"), (snapshot) => {
    if (snapshot.empty) {
        console.warn("⚠️ Firebase: Không tìm thấy sản phẩm nào trong collection 'products'");
    }
    
    const firebaseProducts = [];
    console.log("🔥 Firebase Data Received:", snapshot.size, "products found");

    // Chỉ hiển thị toast nếu không phải lần tải dữ liệu đầu tiên
    if (!isInitialLoad) {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const docData = change.doc.data();
          if (docData.status !== "pending") {
            showToast({ id: change.doc.id, ...docData });
          }
        }
      });
    }

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.status === "pending") return;
      // Đảm bảo các giá trị số được convert đúng kiểu để không bị lỗi khi lọc/hiển thị
      firebaseProducts.push({ 
        id: doc.id, 
        ...data,
        currentPrice: Number(data.currentPrice || 0),
        timeRemainingSeconds: Number(data.timeRemainingSeconds || 0)
      });
    });

    // 1. Hợp nhất nguồn dữ liệu: Chỉ lấy từ Firebase và LocalStorage
    allProducts = [...firebaseProducts, ...userProducts];
    
    console.log("📦 Tổng số sản phẩm đang quản lý:", allProducts.length);

    // 2. Xử lý "Phiên Đấu Giá Hot Nhất"
    allProducts.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB - dateA;
    });
    applyFilters(); // Hiển thị vào mục "Hot Nhất" (.product-catalog)

    // 3. Xử lý "Phiên Đấu Giá Trực Tiếp"
    const liveProducts = [...allProducts]
        .filter(p => {
            const timeData = window.Utils.calculateRemainingTime(p);
            return timeData.seconds > 0;
        })
        .sort((a, b) => window.Utils.calculateRemainingTime(a).seconds - window.Utils.calculateRemainingTime(b).seconds)
        .slice(0, 6); // Hiển thị tối đa 6 sản phẩm sắp kết thúc

    displayLiveAuctions(liveProducts);
    pickAndDisplayHeroProduct();
    isInitialLoad = false;
  });

  // Kiểm tra cập nhật Hero Section mỗi phút
  setInterval(() => {
    if (allProducts.length > 0) pickAndDisplayHeroProduct();
  }, 60000);

  // Thêm logic điều hướng cho Carousel (Nút Trước/Sau)
  document.querySelectorAll('.carousel-nav').forEach(button => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-target');
      const container = document.getElementById(targetId);
      if (!container) return;

      const scrollAmount = container.offsetWidth * 0.8; // Cuộn khoảng 80% chiều rộng khung nhìn
      if (button.classList.contains('prev')) {
        container.scrollLeft -= scrollAmount;
      } else {
        container.scrollLeft += scrollAmount;
      }
    });
  });
});
