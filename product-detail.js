import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc, onSnapshot, updateDoc, arrayUnion, collection, query, where, limit, getDocs, deleteDoc, addDoc, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // Hiệu ứng Progress Bar và Fade-in
    const progressBar = document.createElement('div');
    progressBar.className = 'page-progress';
    document.body.appendChild(progressBar);
    document.body.classList.add('page-loading');

    requestAnimationFrame(() => {
        progressBar.style.width = '100%';
        document.body.classList.remove('page-loading');
        setTimeout(() => {
            progressBar.style.opacity = '0';
            setTimeout(() => progressBar.remove(), 300);
        }, 400);
    });

    // Lấy ID sản phẩm từ URL
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    // Khởi tạo các phần tử DOM
    const productNameElem = document.getElementById('product-detail-name');
    const productImageElem = document.getElementById('product-detail-image');
    const productDescriptionElem = document.getElementById('product-detail-description');
    const startPriceElem = document.getElementById('start-price');
    const currentPriceElem = document.getElementById('current-price');
    const productTagsContainer = document.getElementById('product-tags-container'); // Thêm tham chiếu đến container chứa tags
    const countdownElem = document.getElementById('countdown');
    const bidInput = document.getElementById('bid-input');
    const bidButton = document.getElementById('bid-button');
    const bidMessage = document.getElementById('message');
    const bidHistoryTableBody = document.getElementById('bid-history-table-body');
    const bidTimelineList = document.getElementById('bid-timeline-list');
    const commentTextarea = document.getElementById('comment-textarea');
    const submitCommentBtn = document.getElementById('submit-comment-btn');
    const commentsList = document.getElementById('comments-list');
    
    // DOM cho các thuộc tính và tab
    // These elements might not exist for all products, consider conditional rendering or default values
    const attrCondition = document.getElementById('attr-condition');
    const attrOrigin = document.getElementById('attr-origin');
    const attrYear = document.getElementById('attr-year');
    const fullDesc = document.getElementById('full-description');
    const specsList = document.getElementById('specs-list');

    const editProductBtn = document.getElementById('edit-product-btn');
    const archiveProductBtn = document.getElementById('archive-product-btn');

    let CURRENT_USER_ID = null;
    let CURRENT_USER_NAME = null;
    let CURRENT_USER_PHOTO = null;
    let currentProductData = null; // Biến lưu trữ dữ liệu sản phẩm để cập nhật khi Auth thay đổi

    onAuthStateChanged(auth, (user) => {
        CURRENT_USER_ID = user ? user.uid : null;
        CURRENT_USER_NAME = user ? (user.displayName || user.email.split('@')[0]) : null;
        CURRENT_USER_PHOTO = user ? user.photoURL : null;

        // Nếu đã tải xong dữ liệu sản phẩm, cập nhật lại giao diện để hiển thị nút sửa nếu cần
        if (currentProductData) updateProductUI(currentProductData);
    });

    let activeTimer = null;
    let relatedProductsLoaded = false;

    function loadProduct() {
        const docRef = doc(db, "products", productId);

        // Lắng nghe thay đổi thời gian thực từ Firestore
        onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const product = { id: docSnap.id, ...docSnap.data() };
                currentProductData = product;
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

    function loadComments() {
        if (!productId) return;
        const q = query(
            collection(db, "comments"),
            where("productId", "==", productId),
            orderBy("timestamp", "desc")
        );

        onSnapshot(q, (snapshot) => {
            commentsList.innerHTML = '';
            if (snapshot.empty) {
                commentsList.innerHTML = '<p style="color: var(--text-muted); padding: 20px 0;">Chưa có bình luận nào cho sản phẩm này.</p>';
                return;
            }

            snapshot.forEach((docSnap) => {
                const c = docSnap.data();
                const date = c.timestamp ? c.timestamp.toDate() : new Date();
                const timeStr = date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

                const isSeller = CURRENT_USER_ID === currentProductData?.sellerId;
                
                // Giao diện cho phần phản hồi của người bán
                const sellerReplyHtml = c.sellerReply ? `
                    <div class="seller-reply" style="margin-top: 10px; padding: 12px; background: #f8fafc; border-left: 3px solid var(--primary); border-radius: 4px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <strong style="font-size: 0.85rem; color: var(--primary);"><i class="fa-solid fa-reply fa-flip-both"></i> Phản hồi từ người bán</strong>
                            <span style="font-size: 0.7rem; color: var(--text-muted);">${c.sellerReply.timestamp?.toDate().toLocaleString('vi-VN') || 'Vừa xong'}</span>
                        </div>
                        <p style="font-size: 0.9rem; color: var(--text-main); margin: 0;">${c.sellerReply.text}</p>
                    </div>
                ` : '';

                // Nút trả lời chỉ hiện cho người bán và khi chưa có phản hồi
                const replyActionHtml = (isSeller && !c.sellerReply) ? `
                    <div style="margin-top: 8px;">
                        <button class="btn-text show-reply-form" data-id="${docSnap.id}" style="font-size: 0.8rem; padding: 0; color: var(--primary); cursor: pointer; background: none; border: none; font-weight: 600;">Trả lời</button>
                        <div id="reply-form-${docSnap.id}" style="display: none; margin-top: 10px;">
                            <textarea class="reply-input" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; font-family: inherit;" placeholder="Viết câu trả lời..."></textarea>
                            <div style="display: flex; gap: 10px; margin-top: 5px; justify-content: flex-end;">
                                <button class="btn-text cancel-reply" data-id="${docSnap.id}" style="font-size: 0.8rem; cursor: pointer; background: none; border: none;">Hủy</button>
                                <button class="btn-primary send-reply" data-id="${docSnap.id}" data-buyer-id="${c.userId}" style="padding: 4px 12px; font-size: 0.8rem; width: auto;">Gửi</button>
                            </div>
                        </div>
                    </div>
                ` : '';
                
                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.gap = '15px';
                li.style.padding = '15px 0';
                li.style.borderBottom = '1px solid var(--border)';
                
                li.innerHTML = `
                    <img src="${c.userPhoto || 'https://i.pravatar.cc/150'}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: #eee;">
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px; align-items: center;">
                            <strong style="font-size: 0.9rem; color: var(--text-main);">${c.userName}</strong>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">${timeStr}</span>
                        </div>
                        <p style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.5; margin: 0;">${c.text}</p>
                        ${sellerReplyHtml}
                        ${replyActionHtml}
                    </div>
                `;
                commentsList.appendChild(li);
            });

            // Gán sự kiện cho các nút phản hồi vừa render
            attachReplyEvents();
        });
    }

    function attachReplyEvents() {
        // Hiện form trả lời
        commentsList.querySelectorAll('.show-reply-form').forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.id;
                document.getElementById(`reply-form-${id}`).style.display = 'block';
                btn.style.display = 'none';
            };
        });

        // Hủy trả lời
        commentsList.querySelectorAll('.cancel-reply').forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.id;
                document.getElementById(`reply-form-${id}`).style.display = 'none';
                commentsList.querySelector(`.show-reply-form[data-id="${id}"]`).style.display = 'block';
            };
        });

        // Gửi trả lời
        commentsList.querySelectorAll('.send-reply').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const buyerId = btn.dataset.buyerId;
                const input = document.querySelector(`#reply-form-${id} .reply-input`);
                const text = input.value.trim();
                if (!text) return;

                btn.disabled = true;
                try {
                    // 1. Cập nhật phản hồi vào bình luận
                    await updateDoc(doc(db, "comments", id), {
                        sellerReply: {
                            text: text,
                            timestamp: new Date() // Sử dụng Date client hoặc serverTimestamp()
                        }
                    });

                    // 2. Tạo thông báo cho người mua
                    await addDoc(collection(db, "notifications"), {
                        userId: buyerId,
                        type: 'seller_reply',
                        productId: productId,
                        productName: currentProductData.name,
                        message: `Người bán đã trả lời bình luận của bạn về "${currentProductData.name}"`,
                        timestamp: serverTimestamp(),
                        isRead: false
                    });

                } catch (error) {
                    console.error("Lỗi khi gửi phản hồi:", error);
                    alert("Không thể gửi phản hồi.");
                    btn.disabled = false;
                }
            };
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
        
        // Hiển thị Tags với màu sắc
        if (productTagsContainer) {
            productTagsContainer.innerHTML = ''; // Xóa các tags cũ nếu có
            if (product.tags && product.tags.length > 0) {
                product.tags.forEach(tag => {
                    const style = window.Utils.getTagStyle(tag);
                    const tagSpan = document.createElement('span');
                    tagSpan.style.background = style.bg;
                    tagSpan.style.color = style.text;
                    tagSpan.style.fontSize = '0.8rem'; // Kích thước font có thể điều chỉnh
                    tagSpan.style.padding = '4px 10px';
                    tagSpan.style.borderRadius = '15px';
                    tagSpan.style.fontWeight = '600';
                    tagSpan.style.marginRight = '8px'; // Khoảng cách giữa các tags
                    tagSpan.innerText = `#${tag}`;
                    productTagsContainer.appendChild(tagSpan);
                });
            }
        }

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

        const timeData = window.Utils.calculateRemainingTime(product);

        // Hiển thị thông tin người bán rút gọn
        const fetchSellerPreview = async () => {
            const sellerSnap = await getDoc(doc(db, "users", product.sellerId));
            if (sellerSnap.exists()) {
                const s = sellerSnap.data();
                nameElem.innerText = s.displayName || "Người bán ẩn danh";

                // Lấy huy chương hiển thị ở bản preview
                const transQuery = query(collection(db, "transactions"), where("userId", "==", product.sellerId), where("type", "==", "in"));
                const transSnap = await getDocs(transQuery);
                const badge = window.Utils.getSellerBadge(transSnap.size);
                
                if (badge) {
                    const badgeIcon = `<i class="fa-solid ${badge.icon}" style="margin-left: 5px;" title="${badge.name} (Hạng ${badge.name.split(' ')[0]})"></i>`;
                    nameElem.insertAdjacentHTML('beforeend', badgeIcon);
                }

                document.getElementById('seller-preview-img').src = s.photoURL || "https://i.pravatar.cc/150";
                document.getElementById('view-seller-profile').href = `seller-profile.html?uid=${product.sellerId}`;
            }
        };
        if (product.sellerId) fetchSellerPreview();

        const isOwner = CURRENT_USER_ID === product.sellerId;

        // Hiển thị nút chỉnh sửa cho chủ sở hữu
        if (editProductBtn) {
            editProductBtn.style.display = isOwner ? 'flex' : 'none';
            editProductBtn.href = `sell.html?id=${product.id}&mode=edit`;
        }
        
        // Hiển thị nút ẩn cho chủ sở hữu
        if (archiveProductBtn) {
            archiveProductBtn.style.display = isOwner ? 'flex' : 'none';
            
            // Kiểm tra nếu đã có người đặt giá thì vô hiệu hóa nút xóa
            if (product.history && product.history.length > 0) {
                archiveProductBtn.disabled = true;
                archiveProductBtn.style.opacity = "0.5";
                archiveProductBtn.style.cursor = "not-allowed";
                archiveProductBtn.title = "Không thể ẩn sản phẩm đã có người đặt giá";
            } else {
                archiveProductBtn.disabled = false;
                archiveProductBtn.style.opacity = "1";
                archiveProductBtn.style.cursor = "pointer";
                archiveProductBtn.title = "Ẩn bài đăng này khỏi sàn";
            }
        }

        // Quản lý bộ đếm thời gian
        if (activeTimer) activeTimer.stop();

        if (typeof window.AuctionTimer === 'function') {
            activeTimer = new window.AuctionTimer(timeData.seconds, (timeStr) => {
                countdownElem.innerText = timeData.isComingSoon ? `Bắt đầu sau: ${timeStr}` : timeStr;
                // Chặn nút nếu chưa bắt đầu HOẶC là chủ sở hữu
                bidButton.disabled = timeData.isComingSoon || isOwner;
            }, () => {
                if (timeData.isComingSoon) {
                    loadProduct(); // Load lại để chuyển sang trạng thái đang đấu giá
                } else {
                    countdownElem.innerText = "Đã kết thúc!";
                    bidButton.disabled = true;
                    bidInput.disabled = true;
                }
            });
            activeTimer.start();
        } else {
            countdownElem.innerText = "Đang khởi tạo...";
            setTimeout(() => updateProductUI(product), 500);
        }

        // Ngăn chặn đấu giá khi sản phẩm đang chờ duyệt hoặc chủ sở hữu tự đấu giá
        if (product.status === "pending") {
            bidInput.disabled = true;
            bidButton.disabled = true;
            bidButton.innerText = "Chờ duyệt";
            bidMessage.innerText = "Sản phẩm này đang chờ quản trị viên phê duyệt.";
        } else if (isOwner) {
            bidInput.disabled = true;
            bidButton.disabled = true;
            bidButton.innerText = "Sản phẩm của bạn";
            bidMessage.innerText = "Bạn không thể tự đấu giá sản phẩm của chính mình.";
        }

        // Tải sản phẩm liên quan (chỉ chạy 1 lần)
        if (!relatedProductsLoaded && product.category) {
            loadRelatedProducts(product);
            relatedProductsLoaded = true;
        }
    }

    async function loadRelatedProducts(currentProduct) {
        const relatedContainer = document.getElementById('related-products-grid');
        if (!relatedContainer) return;

        try {
            // Truy vấn các sản phẩm cùng danh mục, giới hạn 5 sản phẩm (để trừ đi chính nó)
            const q = query(
                collection(db, "products"),
                where("category", "==", currentProduct.category),
                limit(5)
            );

            const querySnapshot = await getDocs(q);
            relatedContainer.innerHTML = '';
            
            let displayedCount = 0;
            querySnapshot.forEach((docSnap) => {
                const product = { id: docSnap.id, ...docSnap.data() };
                
                // Không hiển thị lại chính sản phẩm đang xem
                if (product.id !== productId && displayedCount < 4) {
                    const card = renderRelatedCard(product);
                    relatedContainer.appendChild(card);
                    displayedCount++;
                }
            });

            if (displayedCount === 0) {
                document.querySelector('.related-products-section').style.display = 'none';
            }
        } catch (error) {
            console.error("Lỗi tải sản phẩm liên quan:", error);
        }
    }

    function renderRelatedCard(product) {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.style.flex = 'none'; // Đảm bảo card vừa với grid layout
        
        const tagsHTML = (product.tags || []).map(tag => {
            const style = window.Utils.getTagStyle(tag);
            return `<span style="background: ${style.bg}; color: ${style.text}; font-size: 0.6rem; padding: 2px 6px; border-radius: 10px; font-weight: 600;">#${tag}</span>`;
        }).join('');

        card.innerHTML = `
            <div class="product-image-thumbnail" style="height: 160px;">
                <img src="${product.imageUrl}" alt="${product.name}">
                <div class="timer-overlay" style="font-size: 0.75rem;">
                    <span class="related-timer" data-id="${product.id}">Đang tải...</span>
                </div>
            </div>
            <div class="product-details" style="padding: 12px;">
                <h3 style="font-size: 0.95rem; min-height: 2.6em;">${product.name}</h3>
                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;">${tagsHTML}</div>
                <div class="card-footer">
                    <div class="price-info">
                        <strong style="font-size: 1rem; color: var(--primary);">${window.Utils.formatCurrency(product.currentPrice)}</strong>
                    </div>
                    <a href="product-detail.html?id=${product.id}" class="place-bid-btn" style="padding: 6px 12px; font-size: 0.75rem;">Xem</a>
                </div>
            </div>
        `;

        // Khởi tạo timer cho sản phẩm liên quan
        const timeData = window.Utils.calculateRemainingTime(product);
        const timerElem = card.querySelector('.related-timer');
        
        if (window.AuctionTimer) {
            new window.AuctionTimer(timeData.seconds, (t) => {
                timerElem.innerText = timeData.isComingSoon ? `Chờ: ${t}` : t;
            }).start();
        }
        return card;
    }

    function maskUsername(name) {
        if (!name) return "Ẩn danh";
        const parts = name.split(' ');
        const lastPart = parts[parts.length - 1];
        if (lastPart.length <= 1) return parts[0] + " ***";
        return `${parts[0]} ${lastPart[0]}***${lastPart[lastPart.length - 1]}`;
    }

    function renderHistory(history) {
        if (!bidHistoryTableBody || !bidTimelineList) return;

        if (history.length === 0) {
            bidHistoryTableBody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px 0;">Chưa có lượt đặt giá nào.</td>
                </tr>
            `;
            bidTimelineList.innerHTML = `
                <li style="text-align: center; color: var(--text-muted); padding: 20px 0;">Chưa có lượt đặt giá nào.</li>
            `;
            return;
        }

        // 1. Render Bảng Xếp Hạng (Sắp xếp theo giá giảm dần)
        const sortedLeaderboard = [...history].sort((a, b) => b.amount - a.amount);
        bidHistoryTableBody.innerHTML = sortedLeaderboard.map((bid, index) => {
            const isLeading = index === 0;
            const rowClass = isLeading ? 'class="row-leading"' : '';
            
            let rankHtml = '';
            if (index === 0) {
                rankHtml = '<span class="rank-medal rank-gold" title="Hạng 1"><i class="fa-solid fa-medal"></i></span>';
            } else if (index === 1) {
                rankHtml = '<span class="rank-medal rank-silver" title="Hạng 2"><i class="fa-solid fa-medal"></i></span>';
            } else if (index === 2) {
                rankHtml = '<span class="rank-medal rank-bronze" title="Hạng 3"><i class="fa-solid fa-medal"></i></span>';
            } else {
                rankHtml = `<span class="rank-badge">${index + 1}</span>`;
            }

            const statusHtml = isLeading 
                ? '<span class="status-badge leading"><i class="fa-solid fa-circle-check"></i> Dẫn đầu</span>'
                : '<span class="status-badge outbid"><i class="fa-solid fa-circle-minus"></i> Bị vượt</span>';

            return `
                <tr ${rowClass}>
                    <td>${rankHtml}</td>
                    <td><strong>${maskUsername(bid.user)}</strong></td>
                    <td><strong style="color: var(--primary);">${window.Utils.formatCurrency(bid.amount)}</strong></td>
                    <td>${statusHtml}</td>
                </tr>
            `;
        }).join('');

        // 2. Render Timeline Lịch Sử Thầu (Sắp xếp theo thời gian mới nhất lên đầu)
        // DB lưu theo thứ tự thời gian cũ -> mới. Đảo ngược lại thành mới -> cũ.
        const timelineBids = [...history].reverse();
        bidTimelineList.innerHTML = timelineBids.map((bid, index) => {
            const isLatest = index === 0;
            return `
                <li style="display: flex; justify-content: space-between; align-items: center; padding: 12px 10px; border-bottom: 1px dashed var(--border); border-radius: 6px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${isLatest ? 'var(--primary)' : 'var(--border)'}; display: inline-block;"></span>
                        <div>
                            <strong style="font-size: 0.9rem; color: var(--text-main);">${maskUsername(bid.user)}</strong>
                            <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 5px;">${bid.time}</span>
                        </div>
                    </div>
                    <div style="text-align: right; display: flex; align-items: center; gap: 5px;">
                        <strong style="font-size: 0.95rem; color: ${isLatest ? 'var(--primary)' : 'var(--text-main)'};">${window.Utils.formatCurrency(bid.amount)}</strong>
                        ${isLatest ? '<span style="font-size: 0.65rem; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 600; display: inline-block;">Mới nhất</span>' : ''}
                    </div>
                </li>
            `;
        }).join('');
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

    // Xử lý Ẩn sản phẩm (Archive)
    archiveProductBtn?.addEventListener('click', async () => {
        // Kiểm tra an toàn: Không cho phép ẩn nếu đã có lịch sử đấu giá
        if (currentProductData && currentProductData.history && currentProductData.history.length > 0) {
            alert('Không thể ẩn sản phẩm đã có người đặt giá.');
            return;
        }

        if (confirm('Bạn có chắc chắn muốn ẩn sản phẩm này? Người mua sẽ không tìm thấy sản phẩm này nữa.')) {
            try {
                archiveProductBtn.disabled = true;
                archiveProductBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
                
                await updateDoc(doc(db, "products", productId), { isArchived: true });
                
                alert('Đã ẩn sản phẩm thành công!');
                window.location.href = 'index.html';
            } catch (error) {
                console.error("Lỗi khi ẩn sản phẩm:", error);
                alert('Có lỗi xảy ra. Vui lòng thử lại sau.');
                archiveProductBtn.disabled = false;
                archiveProductBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Ẩn sản phẩm';
            }
        }
    });

    // Xử lý đặt giá
    bidButton.addEventListener('click', async () => {
        if (!CURRENT_USER_ID) {
            alert("Vui lòng đăng nhập để tham gia đấu giá.");
            window.location.href = 'login.html';
            return;
        }

        if (currentProductData && CURRENT_USER_ID === currentProductData.sellerId) {
            window.Utils.showToast ? window.Utils.showToast("Bạn không thể tự đấu giá sản phẩm của chính mình!", "error") : alert("Bạn không thể tự đấu giá sản phẩm của chính mình!");
            return;
        }

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
                    user: CURRENT_USER_NAME || "Người dùng ẩn danh",
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

    // Logic điều hướng cho Carousel (Nút Trước/Sau)
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

    // Xử lý gửi bình luận
    submitCommentBtn?.addEventListener('click', async () => {
        if (!CURRENT_USER_ID) {
            alert("Vui lòng đăng nhập để gửi bình luận.");
            window.location.href = 'login.html';
            return;
        }

        const text = commentTextarea.value.trim();
        if (!text) return;

        submitCommentBtn.disabled = true;
        try {
            await addDoc(collection(db, "comments"), {
                productId: productId,
                userId: CURRENT_USER_ID,
                userName: CURRENT_USER_NAME,
                userPhoto: CURRENT_USER_PHOTO,
                text: text,
                timestamp: serverTimestamp()
            });
            commentTextarea.value = '';
        } catch (error) {
            console.error("Lỗi khi gửi bình luận:", error);
            alert("Không thể gửi bình luận lúc này.");
        } finally {
            submitCommentBtn.disabled = false;
        }
    });

    loadProduct();
    loadComments();
});