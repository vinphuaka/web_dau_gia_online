import { db } from './firebase-config.js';
import { doc, getDoc, collection, query, where, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sellerId = urlParams.get('uid');

    if (!sellerId) {
        window.location.href = 'index.html';
        return;
    }

    const sellerNameElem = document.getElementById('seller-name');
    const sellerAvatarElem = document.getElementById('seller-avatar');
    const sellerJoinDateElem = document.getElementById('seller-join-date');
    const sellerProductCountElem = document.getElementById('seller-product-count');
    const productsGrid = document.getElementById('seller-products-grid');

    async function loadSellerInfo() {
        try {
            const userRef = doc(db, "users", sellerId);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const data = userSnap.data();
                sellerNameElem.innerText = data.displayName || "Người bán ẩn danh";
                sellerAvatarElem.src = data.photoURL || "https://i.pravatar.cc/150";
                if (data.createdAt) {
                    const date = new Date(data.createdAt);
                    sellerJoinDateElem.innerText = date.toLocaleDateString('vi-VN');
                }

                // Đếm số giao dịch thành công (loại 'in' - doanh thu) để cấp huy chương
                const transQuery = query(collection(db, "transactions"), where("userId", "==", sellerId), where("type", "==", "in"));
                const transSnap = await getDocs(transQuery);
                const salesCount = transSnap.size;
                
                const badge = window.Utils.getSellerBadge(salesCount);
                if (badge) {
                    const badgeHtml = `<span class="seller-badge ${badge.class}"><i class="fa-solid ${badge.icon}"></i> ${badge.name}</span>`;
                    sellerNameElem.insertAdjacentHTML('afterend', badgeHtml);
                }

            }
        } catch (error) {
            console.error("Lỗi khi tải thông tin người bán:", error);
        }
    }

    function loadSellerProducts() {
        const q = query(
            collection(db, "products"),
            where("sellerId", "==", sellerId),
            where("isArchived", "==", false)
        );

        onSnapshot(q, (snapshot) => {
            productsGrid.innerHTML = '';
            sellerProductCountElem.innerText = snapshot.size;

            if (snapshot.empty) {
                productsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Người bán này hiện chưa có sản phẩm nào đang đấu giá.</p>';
                return;
            }

            snapshot.forEach((docSnap) => {
                const product = { id: docSnap.id, ...docSnap.data() };
                renderProductCard(product);
            });
        });
    }

    function renderProductCard(product) {
        // Sử dụng logic render tương tự như trong catalog.js hoặc products.js
        // Để tiết kiệm không gian, tôi giả định bạn đã có hàm renderProductCard dùng chung hoặc copy từ catalog.js
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="product-image-thumbnail">
                <img src="${product.imageUrl}" alt="${product.name}">
            </div>
            <div class="product-details">
                <h3>${product.name}</h3>
                <strong class="current-price">${window.Utils.formatCurrency(product.currentPrice)}</strong>
                <a href="product-detail.html?id=${product.id}" class="place-bid-btn" style="margin-top: 15px; display: block; text-align: center;">Xem chi tiết</a>
            </div>
        `;
        productsGrid.appendChild(card);
    }

    loadSellerInfo();
    loadSellerProducts();
});