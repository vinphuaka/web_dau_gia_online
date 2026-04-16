import { db } from './firebase-config.js';
import { doc, onSnapshot, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // Lấy ID sản phẩm từ URL
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    // Khởi tạo các phần tử DOM
    const productNameElem = document.getElementById('product-detail-name');
    const productImageElem = document.getElementById('product-detail-image');
    const productDescriptionElem = document.getElementById('product-detail-description');
    const startPriceElem = document.getElementById('start-price');
    const currentPriceElem = document.getElementById('current-price');
    const countdownElem = document.getElementById('countdown');
    const bidInput = document.getElementById('bid-input');
    const bidButton = document.getElementById('bid-button');
    const bidMessage = document.getElementById('message');
    const bidHistoryList = document.getElementById('bid-history');
    
    // DOM cho các thuộc tính và tab
    // These elements might not exist for all products, consider conditional rendering or default values
    const attrCondition = document.getElementById('attr-condition');
    const attrOrigin = document.getElementById('attr-origin');
    const attrYear = document.getElementById('attr-year');
    const fullDesc = document.getElementById('full-description');
    const specsList = document.getElementById('specs-list');

    let timerStarted = false;

    function loadProduct() {
        const docRef = doc(db, "products", productId);

        // Lắng nghe thay đổi thời gian thực từ Firestore
        onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const product = { id: docSnap.id, ...docSnap.data() };
                updateProductUI(product);
            } else {
                // Fallback nếu không có trên Firebase (ví dụ hàng test local)
                const userProducts = window.Utils.getFromStorage('user_added_products') || [];
                const product = userProducts.find(p => p.id === productId);
                if (product) updateProductUI(product);
                else document.querySelector('.container').innerHTML = '<p class="error-message">Không tìm thấy sản phẩm!</p>';
            }
        });
    }

    function updateProductUI(product) {
        // Hiển thị thông tin
        productNameElem.classList.remove('skeleton');
        productImageElem.classList.remove('skeleton');
        productDescriptionElem.classList.remove('skeleton');
        countdownElem.classList.remove('skeleton');

        productNameElem.innerText = product.name;
        productImageElem.src = product.imageUrl || 'https://placehold.co/600x450?text=Dang+tai...';
        productImageElem.onerror = () => {
            productImageElem.src = 'https://placehold.co/600x450?text=Loi+anh';
        };
        productDescriptionElem.innerText = product.description;
        fullDesc.innerText = product.description;
        startPriceElem.innerText = window.Utils.formatCurrency(product.startPrice);
        currentPriceElem.innerText = window.Utils.formatCurrency(product.currentPrice);
        
        // Cập nhật Product Attributes
        attrCondition.innerText = product.condition || "Mới (Seal)";
        attrOrigin.innerText = product.origin || "Quốc tế";
        attrYear.innerText = product.year || "2023";

        // Hiển thị thông số (Specs)
        if (product.specs) {
            specsList.innerHTML = Object.entries(product.specs).map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join('');
        }

        // Render History
        renderHistory(product.history || []);

        // Chỉ khởi chạy bộ đếm thời gian một lần duy nhất
        if (!timerStarted) {
            if (typeof window.AuctionTimer !== 'function') {
                countdownElem.innerText = "Đang khởi tạo...";
                setTimeout(() => updateProductUI(product), 500);
                return;
            }

            const timer = new window.AuctionTimer(product.timeRemainingSeconds || 3600, (timeStr) => {
                countdownElem.innerText = timeStr;
            }, () => {
                countdownElem.innerText = "Đã kết thúc!";
                bidButton.disabled = true;
                bidInput.disabled = true;
            });
            timer.start();
            timerStarted = true;
        }
    }

    function maskUsername(name) {
        if (!name) return "Ẩn danh";
        const parts = name.split(' ');
        const lastPart = parts[parts.length - 1];
        if (lastPart.length <= 1) return parts[0] + " ***";
        return `${parts[0]} ${lastPart[0]}***${lastPart[lastPart.length - 1]}`;
    }

    function renderHistory(history) {
        bidHistoryList.innerHTML = history.length > 0 
            ? history.map((bid, index) => `
                <li class="${index === 0 ? 'leading-bid' : ''}">
                    <div class="bidder-info-box">
                        <span class="bidder-name">${maskUsername(bid.user)}</span>
                        <span class="bid-time">${bid.time}</span>
                    </div>
                    <div class="bid-amount-box">
                        <strong>${window.Utils.formatCurrency(bid.amount)}</strong>
                        ${index === 0 ? '<span class="leading-badge">Đang dẫn đầu</span>' : ''}
                    </div>
                </li>`).join('')
            : '<li>Chưa có lượt đặt giá nào.</li>';
    }

    // Logic Tab Control
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    // Xử lý đặt giá
    bidButton.addEventListener('click', async () => {
        const bidValue = parseInt(bidInput.value);
        const currentPrice = parseInt(currentPriceElem.innerText.replace(/[^0-9]/g, ''));

        if (isNaN(bidValue) || bidValue <= currentPrice) {
            window.Utils.showToast ? window.Utils.showToast("Giá đặt phải cao hơn giá hiện tại!", "error") : alert("Giá đặt không hợp lệ!");
            return;
        }

        // Hiệu ứng phản hồi tức thì
        const originalText = bidButton.innerText;
        bidButton.disabled = true;
        bidButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

        try {
            const docRef = doc(db, "products", productId);
            // Gửi dữ liệu lên Firebase
            await updateDoc(docRef, {
                currentPrice: bidValue,
                history: arrayUnion({
                    user: "Người dùng " + Math.floor(Math.random() * 1000), // Giả lập user, bạn có thể thay bằng tên thật nếu có Auth
                    amount: bidValue,
                    time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                })
            });

            bidInput.value = '';
            if (window.Utils.showToast) window.Utils.showToast("Đặt giá thành công!", "success");
        } catch (error) {
            console.error("Lỗi khi đặt giá:", error);
            alert("Có lỗi xảy ra khi đặt giá!");
        } finally {
            bidButton.disabled = false;
            bidButton.innerText = originalText;
        }
    });

    loadProduct();
});