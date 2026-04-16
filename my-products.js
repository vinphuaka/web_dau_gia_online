import { db } from './firebase-config.js';
import { collection, query, where, onSnapshot, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const productsList = document.getElementById('my-products-list');
    const noProductsMsg = document.getElementById('no-products-msg');
    const MOCK_USER_ID = "user_123";

    // 1. Lắng nghe danh sách sản phẩm của người dùng này
    const q = query(collection(db, "products"), where("sellerId", "==", MOCK_USER_ID));

    onSnapshot(q, (snapshot) => {
        productsList.innerHTML = '';
        
        if (snapshot.empty) {
            noProductsMsg.style.display = 'block';
            return;
        }

        noProductsMsg.style.display = 'none';
        snapshot.forEach((docSnap) => {
            const product = { id: docSnap.id, ...docSnap.data() };
            const row = renderProductRow(product);
            productsList.appendChild(row);
        });
    });

    function renderProductRow(product) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="manage-item-info">
                    <img src="${product.imageUrl}" alt="">
                    <div>
                        <strong>${product.name}</strong>
                        <span class="cat-tag">${product.category}</span>
                    </div>
                </div>
            </td>
            <td><strong>${window.Utils.formatCurrency(product.currentPrice)}</strong></td>
            <td>${new Date(product.createdAt).toLocaleDateString('vi-VN')}</td>
            <td><span class="status-badge active">Đang đấu giá</span></td>
            <td>
                <div class="manage-actions">
                    <a href="product-detail.html?id=${product.id}" class="action-btn view" title="Xem chi tiết"><i class="fa-solid fa-eye"></i></a>
                    <button class="action-btn delete" data-id="${product.id}" title="Xóa"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;

        // Sự kiện xóa sản phẩm
        tr.querySelector('.delete').onclick = async (e) => {
            const id = e.currentTarget.dataset.id;
            if (confirm('Bạn có chắc chắn muốn xóa sản phẩm này? Thao tác này không thể hoàn tác.')) {
                try {
                    await deleteDoc(doc(db, "products", id));
                    // onSnapshot sẽ tự động cập nhật lại danh sách
                } catch (error) {
                    console.error("Lỗi khi xóa:", error);
                    alert("Không thể xóa sản phẩm lúc này.");
                }
            }
        };

        return tr;
    }
});