import { db } from './firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

let allProducts = [];
let activeTimers = {};
const PRODUCTS_PER_PAGE = 12;
let currentPage = 1;

document.addEventListener("DOMContentLoaded", () => {
    // Hiệu ứng Fade-in khi trang vừa tải
    document.body.classList.add('page-loading');
    requestAnimationFrame(() => {
        // Force reflow để trình duyệt nhận diện trạng thái opacity 0 trước khi xóa class
        document.body.classList.remove('page-loading');
    });

    const gridContainer = document.getElementById("all-products-grid");
    const paginationContainer = document.getElementById("pagination-container");
    const searchInput = document.getElementById("search-input");
    const searchButton = document.getElementById("search-button");
    const sortSelect = document.getElementById("sort-select");
    const titleElem = document.getElementById("catalog-title");
    const minPriceInput = document.getElementById("min-price");
    const maxPriceInput = document.getElementById("max-price");
    const priceFilterBtn = document.getElementById("price-filter-btn");
    
    const productCountElem = document.getElementById("product-count");
    let currentCategory = "all";

    // Đọc từ khóa tìm kiếm từ URL khi trang vừa tải
    const urlParams = new URLSearchParams(window.location.search);
    const initialSearch = urlParams.get('search');
    if (initialSearch && searchInput) {
        searchInput.value = initialSearch;
    }

    function renderProductCard(product) {
        const categoryMap = {
            electronics: "Điện tử", fashion: "Thời trang", watch: "Đồng hồ",
            art: "Nghệ thuật", antiques: "Đồ cổ", home: "Gia dụng", "classic-car": "Xe cổ"
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

    function renderPagination(totalPages) {
        if (!paginationContainer) return;
        paginationContainer.innerHTML = "";

        if (totalPages <= 1) return;

        // Nút Quay lại
        const prevBtn = document.createElement("button");
        prevBtn.className = `page-link ${currentPage === 1 ? 'disabled' : ''}`;
        prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        prevBtn.onclick = () => {
            if (currentPage > 1) {
                currentPage--;
                applyFilters();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        };
        paginationContainer.appendChild(prevBtn);

        // Các số trang
        for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement("button");
            pageBtn.className = `page-link ${i === currentPage ? 'active' : ''}`;
            pageBtn.innerText = i;
            pageBtn.onclick = () => {
                currentPage = i;
                applyFilters();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            };
            paginationContainer.appendChild(pageBtn);
        }

        // Nút Tiếp theo
        const nextBtn = document.createElement("button");
        nextBtn.className = `page-link ${currentPage === totalPages ? 'disabled' : ''}`;
        nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        nextBtn.onclick = () => {
            if (currentPage < totalPages) {
                currentPage++;
                applyFilters();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        };
        paginationContainer.appendChild(nextBtn);
    }

    function applyFilters() {
        const search = (searchInput.value || "").toLowerCase().trim().replace(/^#/, "");
        const minPrice = parseInt(minPriceInput?.value) || 0;
        const maxPrice = parseInt(maxPriceInput?.value) || Infinity;

        let filtered = allProducts.filter(p => 
            (currentCategory === "all" || p.category === currentCategory) &&
            (p.name.toLowerCase().includes(search) || (p.tags && p.tags.some(t => t.toLowerCase().includes(search)))) &&
            (p.currentPrice >= minPrice && p.currentPrice <= maxPrice)
        );

        const sort = sortSelect.value;
        if (sort === "price-asc") filtered.sort((a, b) => a.currentPrice - b.currentPrice);
        else if (sort === "price-desc") filtered.sort((a, b) => b.currentPrice - a.currentPrice);
        else if (sort === "ending-soon") filtered.sort((a, b) => a.timeRemainingSeconds - b.timeRemainingSeconds);

        // Kiểm tra nếu không có sản phẩm nào sau khi lọc
        if (filtered.length === 0) {
            gridContainer.innerHTML = `
                <div class="no-results" style="grid-column: 1/-1; text-align: center; padding: 80px 20px; background: #f8fafc; border-radius: var(--radius); border: 1px dashed var(--border);">
                    <i class="fa-solid fa-magnifying-glass-blur" style="font-size: 3.5rem; color: var(--border); margin-bottom: 20px; display: block;"></i>
                    <h3 style="color: var(--text-main); margin-bottom: 10px; font-size: 1.4rem;">Không tìm thấy sản phẩm nào</h3>
                    <p style="color: var(--text-muted);">Rất tiếc, chúng tôi không tìm thấy sản phẩm nào khớp với lựa chọn của bạn. Hãy thử thay đổi từ khóa hoặc khoảng giá.</p>
                    <button onclick="location.reload()" class="btn-outline" style="margin-top: 20px; padding: 8px 20px; display: inline-flex;">Xóa tất cả bộ lọc</button>
                </div>
            `;
            if (productCountElem) productCountElem.innerText = `(0 sản phẩm)`;
            renderPagination(0);
            return;
        }

        // Tính toán phân trang
        const totalPages = Math.ceil(filtered.length / PRODUCTS_PER_PAGE);
        if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const start = (currentPage - 1) * PRODUCTS_PER_PAGE;
        const paginatedItems = filtered.slice(start, start + PRODUCTS_PER_PAGE);

        gridContainer.innerHTML = "";
        Object.values(activeTimers).forEach(t => t.stop());
        activeTimers = {};

        paginatedItems.forEach(p => {
            const card = renderProductCard(p);
            gridContainer.appendChild(card);
            const timerElem = card.querySelector(`.product-timer[data-id="${p.id}"]`);
            if (timerElem && window.AuctionTimer) {
                const t = new window.AuctionTimer(p.timeRemainingSeconds, (s) => timerElem.innerText = s);
                t.start();
                activeTimers[p.id] = t;
            }
        });
        

        // Cập nhật số lượng sản phẩm tìm thấy
        if (productCountElem) productCountElem.innerText = `(${filtered.length} sản phẩm)`;

        renderPagination(totalPages);
    }
    

    onSnapshot(collection(db, "products"), (snapshot) => {
        allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyFilters();
    });

    // Lắng nghe sự kiện tìm kiếm
    searchButton?.addEventListener("click", applyFilters);
    searchInput?.addEventListener("input", () => {
        currentPage = 1;
        applyFilters();
    });

    // Lắng nghe bộ lọc giá
    priceFilterBtn?.addEventListener("click", () => {
        currentPage = 1;
        applyFilters();
    });
    
    sortSelect.addEventListener("change", () => {
        currentPage = 1;
        applyFilters();
    });
        document.querySelectorAll(".dropdown-content a").forEach(link => {
            link.addEventListener("click", (e) => {
                const cat = e.target.getAttribute("data-category");
                if (cat) {
                    e.preventDefault();
                    currentCategory = cat;
                    titleElem.innerText = e.target.innerText;
                    currentPage = 1;
                    applyFilters();
                }
            });
        });
    });