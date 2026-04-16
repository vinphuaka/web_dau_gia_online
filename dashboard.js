import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    let CURRENT_USER_ID = null;
    let CURRENT_USER_NAME = null;

    // Quản lý các bộ lắng nghe để tránh trùng lặp
    const activeListeners = {
        favorites: null,
        notifications: null,
        transactions: null
    };

    // --- Kiểm tra trạng thái đăng nhập ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            CURRENT_USER_ID = user.uid;
            CURRENT_USER_NAME = user.displayName;
            initDashboard();
        } else {
            // Nếu chưa đăng nhập, chuyển hướng về trang login
            window.location.href = 'login.html';
        }
    });

    function initDashboard() {
    // --- Logic Chuyển Tab Chính (Mua / Bán) ---
    const mainTabBtns = document.querySelectorAll('.dashboard-tab-btn');
    const sections = {
        buying: document.getElementById('buying-section'),
        selling: document.getElementById('selling-section')
    };

    mainTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            mainTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.dataset.mainTab;
            
            Object.keys(sections).forEach(key => {
                sections[key].style.display = key === target ? 'block' : 'none';
            });
        });
    });

    // --- Logic Chuyển mục Sidebar ---
    const sidebarItems = document.querySelectorAll('.sidebar-menu li');
    const dashboardSections = {
        overview: document.getElementById('section-overview'),
        profile: document.getElementById('section-profile'),
        favorites: document.getElementById('section-favorites'),
        notifications: document.getElementById('section-notifications'),
        transactions: document.getElementById('section-transactions'),
        settings: document.getElementById('section-settings')
    };

    sidebarItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const nav = item.dataset.nav;
            if (!nav || !dashboardSections[nav]) return;

            e.preventDefault();
            sidebarItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            Object.keys(dashboardSections).forEach(key => {
                dashboardSections[key].style.display = (key === nav) ? 'block' : 'none';
            });

            if (nav === 'profile') loadUserProfile();
            if (nav === 'favorites') loadFavorites();
            if (nav === 'notifications') loadNotifications();
            if (nav === 'transactions') loadTransactions();
            if (nav === 'settings') loadSettings();
        });
    });

    // Sự kiện Đăng xuất
    const logoutBtn = document.querySelector('li a[style*="color: var(--danger)"]');
    if (logoutBtn) {
        logoutBtn.onclick = (e) => {
            e.preventDefault();
            if (confirm('Bạn có muốn đăng xuất không?')) {
                signOut(auth).then(() => window.location.href = 'index.html');
            }
        };
    }

    // --- Logic Cập nhật Badge Thông báo và Hiệu ứng Rung chuông ---
    function initNotificationBadge() {
        const badge = document.getElementById('sidebar-notif-count');
        const headerBadge = document.getElementById('header-notif-count');
        const sidebarLink = document.querySelector('li[data-nav="notifications"] a');
        const headerLink = document.getElementById('header-notif-btn');
        const qWishlist = query(collection(db, "wishlist"), where("userId", "==", CURRENT_USER_ID));

        onSnapshot(qWishlist, async (snapshot) => {
            const readNotifs = JSON.parse(localStorage.getItem('read_notifications') || '[]');
            let count = 0;
            const productChecks = snapshot.docs.map(async (wishDoc) => {
                const prodId = wishDoc.data().productId;
                if (readNotifs.includes(prodId)) return 0; // Không đếm nếu đã đọc

                const prodRef = doc(db, "products", prodId);
                const prodSnap = await getDoc(prodRef);
                if (prodSnap.exists()) {
                    const p = prodSnap.data();
                    // Đếm các sản phẩm yêu thích sắp kết thúc (dưới 24h)
                    if (p.timeRemainingSeconds > 0 && p.timeRemainingSeconds < 86400) return 1;
                }
                return 0;
            });

            const results = await Promise.all(productChecks);
            count = results.reduce((a, b) => a + b, 0);

            if (count > 0) {
                if (badge) { badge.innerText = count; badge.style.display = 'inline-flex'; }
                if (headerBadge) { headerBadge.innerText = count; headerBadge.style.display = 'inline-flex'; }
                sidebarLink?.classList.add('ringing');
                headerLink?.classList.add('ringing');
            } else {
                if (badge) badge.style.display = 'none';
                if (headerBadge) headerBadge.style.display = 'none';
                sidebarLink?.classList.remove('ringing');
                headerLink?.classList.remove('ringing');
            }
        });
    }

    // --- Logic Khởi tạo Dashboard dựa trên URL Hash ---
    const handleHashNavigation = () => {
        const hash = window.location.hash.substring(1); // Lấy hash từ URL (ví dụ: "profile")
        if (hash && dashboardSections[hash]) {
            // Tìm và kích hoạt mục sidebar tương ứng
            const targetSidebarItem = document.querySelector(`.sidebar-menu li[data-nav="${hash}"]`);
            if (targetSidebarItem) {
                targetSidebarItem.click(); // Kích hoạt logic chuyển đổi tab
            }
        }
    };

    window.addEventListener('load', handleHashNavigation);
    window.addEventListener('hashchange', handleHashNavigation);

    initNotificationBadge();

    // --- Logic Sản phẩm yêu thích (Favorites) ---
    async function loadFavorites() {
        const wishlistContainer = document.getElementById('wishlist-container');
        if (!wishlistContainer) return;
        
        // Hủy bộ lắng nghe cũ nếu có để giải phóng bộ nhớ
        if (activeListeners.favorites) activeListeners.favorites();

        wishlistContainer.innerHTML = '<div class="skeleton-text skeleton" style="width: 100%; height: 200px;"></div>';

        const qWishlist = query(collection(db, "wishlist"), where("userId", "==", CURRENT_USER_ID));
        
        activeListeners.favorites = onSnapshot(qWishlist, async (snapshot) => {
            if (snapshot.empty) {
                wishlistContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Bạn chưa yêu thích sản phẩm nào.</p>';
                return;
            }

            // Tối ưu: Lấy tất cả thông tin sản phẩm song song (Parallel)
            const productPromises = snapshot.docs.map(async (wishDoc) => {
                const wishData = wishDoc.data();
                const prodRef = doc(db, "products", wishData.productId);
                const prodSnap = await getDoc(prodRef);
                if (prodSnap.exists()) {
                    return { id: prodSnap.id, ...prodSnap.data(), wishId: wishDoc.id };
                }
                return null;
            });

            const products = (await Promise.all(productPromises)).filter(p => p !== null);
            
            wishlistContainer.innerHTML = '';
            products.forEach(product => {
                renderFavoriteCard(product, wishlistContainer, product.wishId);
            });
        });
    }

    function renderFavoriteCard(product, container, wishId) {
        const categoryMap = {
            electronics: "Điện tử",
            fashion: "Thời trang",
            watch: "Đồng hồ",
            art: "Nghệ thuật",
            antiques: "Đồ cổ",
            "classic-car": "Xe cổ"
        };
        const displayCat = categoryMap[product.category] || product.category || "Chung";

        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="product-image-thumbnail">
                <div class="card-badges"><span class="badge-cat">${displayCat}</span></div>
                <button class="wishlist-btn-card remove-favorite" data-wish-id="${wishId}" title="Xóa khỏi yêu thích">
                    <i class="fa-solid fa-heart" style="color: var(--danger);"></i>
                </button>
                <img src="${product.imageUrl}" alt="${product.name}">
                <div class="timer-overlay"><i class="fa-regular fa-clock"></i> <span class="timer-countdown" data-seconds="${product.timeRemainingSeconds}">--:--:--</span></div>
            </div>
            <div class="product-details">
                <h3>${product.name}</h3>
                <div class="card-footer">
                    <div class="price-info"><span class="price-label">Giá hiện tại</span><strong class="current-price">${window.Utils.formatCurrency(product.currentPrice)}</strong></div>
                    <a href="product-detail.html?id=${product.id}" class="place-bid-btn">Xem</a>
                </div>
            </div>
        `;
        container.appendChild(card);
        
        // Sự kiện xóa yêu thích
        card.querySelector('.remove-favorite').addEventListener('click', async (e) => {
            const idToDelete = e.currentTarget.dataset.wishId;
            try {
                await deleteDoc(doc(db, "wishlist", idToDelete));
                // onSnapshot trong loadFavorites sẽ tự động cập nhật lại UI
            } catch (error) {
                console.error("Lỗi khi xóa yêu thích:", error);
            }
        });

        // Khởi tạo timer cho card
        const timerElem = card.querySelector('.timer-countdown');
        if (window.AuctionTimer) {
            new window.AuctionTimer(product.timeRemainingSeconds, (t) => timerElem.innerText = t).start();
        }
    }

    // --- Logic Thông báo (Notifications) ---
    let currentNotifFilter = 'all';

    document.getElementById('notif-filters')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-pill')) {
            document.querySelectorAll('#notif-filters .filter-pill').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            currentNotifFilter = e.target.dataset.notifFilter;
            loadNotifications();
        }
    });

    async function loadNotifications() {
        const container = document.getElementById('notifications-container');
        if (!container) return;
        container.innerHTML = '<div class="skeleton-text skeleton" style="height: 60px;"></div>'.repeat(3);

        const readNotifs = JSON.parse(localStorage.getItem('read_notifications') || '[]');
        // Lấy danh sách yêu thích của user
        const qWishlist = query(collection(db, "wishlist"), where("userId", "==", CURRENT_USER_ID));
        
        // Ở đây chúng ta dùng query để lấy các productId user đã thích
        onSnapshot(qWishlist, async (snapshot) => {
            let notifications = [];
            
            for (const wishDoc of snapshot.docs) {
                const wishData = wishDoc.data();
                const prodSnap = await getDoc(doc(db, "products", wishData.productId));
                
                if (prodSnap.exists()) {
                    const product = prodSnap.data();
                    const seconds = product.timeRemainingSeconds;
                    const isRead = readNotifs.includes(prodSnap.id);
                    
                    // Nếu sản phẩm sắp kết thúc (dưới 24h = 86400s)
                    if (seconds > 0 && seconds < 86400) {
                        const notif = {
                            id: prodSnap.id,
                            title: "Sản phẩm yêu thích sắp kết thúc!",
                            message: `Sản phẩm "<strong>${product.name}</strong>" chỉ còn chưa đầy 24 giờ. Hãy kiểm tra giá ngay!`,
                            isUrgent: seconds < 3600, // Khẩn cấp nếu còn dưới 1 giờ
                            timeStr: seconds < 3600 ? "Sắp kết thúc" : "Còn chưa tới 24h",
                            isRead: isRead
                        };

                        if (currentNotifFilter === 'all') notifications.push(notif);
                        else if (currentNotifFilter === 'unread' && !isRead) notifications.push(notif);
                        else if (currentNotifFilter === 'read' && isRead) notifications.push(notif);
                    }
                }
            }

            container.innerHTML = notifications.length ? '' : '<div class="notif-empty"><i class="fa-regular fa-bell-slash" style="font-size: 3rem; opacity: 0.2; margin-bottom: 15px; display: block;"></i>Hiện không có thông báo nào mới.</div>';
            
            notifications.forEach(n => {
                const item = document.createElement('a');
                item.href = `product-detail.html?id=${n.id}`;
                item.className = `notification-item ${n.isUrgent ? 'urgent' : ''} ${n.isRead ? 'read' : 'unread'}`;
                item.innerHTML = `
                    <div class="notification-icon"><i class="fa-solid ${n.isUrgent ? 'fa-triangle-exclamation' : 'fa-clock'}"></i></div>
                    <div class="notification-content">
                        <h4>${n.title}</h4>
                        <p>${n.message}</p>
                        <span class="notification-time">${n.timeStr}</span>
                    </div>
                    ${!n.isRead ? '<div class="unread-dot"></div>' : ''}
                `;

                // Đánh dấu đã đọc khi nhấn vào
                item.addEventListener('click', () => {
                    if (!n.isRead) {
                        const latestRead = JSON.parse(localStorage.getItem('read_notifications') || '[]');
                        if (!latestRead.includes(n.id)) {
                            latestRead.push(n.id);
                            localStorage.setItem('read_notifications', JSON.stringify(latestRead));
                            initNotificationBadge(); // Cập nhật lại số lượng ở sidebar
                        }
                    }
                });

                container.appendChild(item);
            });
        });
    }

    // --- Logic Lịch sử giao dịch (Transactions) ---
    let currentTransFilter = 'all';

    // Lắng nghe sự kiện click vào các nút lọc thời gian
    document.getElementById('transaction-filters')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-pill')) {
            document.querySelectorAll('#transaction-filters .filter-pill').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            currentTransFilter = e.target.dataset.timeFilter;
            loadTransactions(); // Tải lại danh sách với bộ lọc mới
        }
    });

    async function loadTransactions() {
        const transList = document.getElementById('transactions-list');
        if (!transList) return;

        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        const startOfThisYear = new Date(now.getFullYear(), 0, 1);

        transList.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Đang tải lịch sử giao dịch...</td></tr>';

        // Truy vấn các giao dịch liên quan đến user hiện tại
        const qTrans = query(collection(db, "transactions"), where("userId", "==", CURRENT_USER_ID));

        onSnapshot(qTrans, (snapshot) => {
            transList.innerHTML = '';
            
            if (snapshot.empty) {
                transList.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--text-muted);">Bạn chưa có giao dịch nào phát sinh.</td></tr>';
                return;
            }

            snapshot.forEach((docSnap) => {
                const trans = docSnap.data();
                const transDate = new Date(trans.date);
                
                // Logic lọc dữ liệu
                let isMatch = true;
                if (currentTransFilter === 'this-month') {
                    isMatch = transDate >= startOfThisMonth;
                } else if (currentTransFilter === 'last-month') {
                    isMatch = transDate >= startOfLastMonth && transDate <= endOfLastMonth;
                } else if (currentTransFilter === 'this-year') {
                    isMatch = transDate >= startOfThisYear;
                }

                if (!isMatch) return;

                const tr = document.createElement('tr');
                const isOut = trans.type === 'out'; // 'out' là chi tiền (mua), 'in' là nhận tiền (bán)
                
                tr.innerHTML = `
                    <td>${new Date(trans.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                    <td><strong>${trans.description}</strong></td>
                    <td style="color: ${isOut ? 'var(--danger)' : 'var(--success)'}; font-weight: 700;">
                        ${isOut ? '-' : '+'}${window.Utils.formatCurrency(trans.amount)}
                    </td>
                    <td>${isOut ? 'Thanh toán' : 'Doanh thu'}</td>
                    <td><span class="status-pill leading">Hoàn thành</span></td>
                `;
                transList.appendChild(tr);
            });
        });
    }

    // --- Logic Cài đặt (Settings) ---
    const settingsForm = document.getElementById('user-settings-form');
    const emailNotifToggle = document.getElementById('setting-email-notif');
    const browserNotifToggle = document.getElementById('setting-browser-notif');
    const languageSelect = document.getElementById('setting-language');
    const currencySelect = document.getElementById('setting-currency');
    const twoFactorToggle = document.getElementById('setting-2fa');

    async function loadSettings() {
        const userSettingsRef = doc(db, "userSettings", CURRENT_USER_ID); // Dùng collection riêng cho settings
        const settingsSnap = await getDoc(userSettingsRef);
        
        if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            emailNotifToggle.checked = data.emailNotifications || false;
            browserNotifToggle.checked = data.browserNotifications || false;
            languageSelect.value = data.language || 'vi';
            currencySelect.value = data.currency || 'VND';
            if (twoFactorToggle) twoFactorToggle.checked = data.twoFactorAuth || false;
        } else {
            // Đặt giá trị mặc định nếu chưa có cài đặt
            emailNotifToggle.checked = true;
            browserNotifToggle.checked = false;
            languageSelect.value = 'vi';
            currencySelect.value = 'VND';
        }

        loadDevices();
        initSettingsTabs();
    }

    function initSettingsTabs() {
        const settingsTabBtns = document.querySelectorAll('.settings-tab-btn');
        const settingsPanes = document.querySelectorAll('.settings-tab-pane');

        settingsTabBtns.forEach(btn => {
            btn.onclick = () => {
                settingsTabBtns.forEach(b => b.classList.remove('active'));
                settingsPanes.forEach(p => p.classList.remove('active'));
                
                btn.classList.add('active');
                const targetId = `settings-${btn.dataset.settingsTab}`;
                document.getElementById(targetId).classList.add('active');
            };
        });
    }

    // --- Logic Quản lý thiết bị ---
    function loadDevices() {
        const deviceList = document.getElementById('device-list');
        if (!deviceList) return;

        // Giả lập danh sách thiết bị
        const mockDevices = [
            { id: 'dev1', name: 'Chrome trên Windows', location: 'Hà Nội, Việt Nam', lastActive: 'Đang hoạt động', isCurrent: true, icon: 'fa-desktop' },
            { id: 'dev2', name: 'Safari trên iPhone 13', location: 'TP. Hồ Chí Minh, Việt Nam', lastActive: '2 giờ trước', isCurrent: false, icon: 'fa-mobile-screen-button' }
        ];

        deviceList.innerHTML = mockDevices.map(dev => `
            <div class="device-item" id="device-${dev.id}">
                <div class="device-info">
                    <div class="device-icon"><i class="fa-solid ${dev.icon}"></i></div>
                    <div class="device-details">
                        <h4>${dev.name} ${dev.isCurrent ? '<span class="device-status-tag">Thiết bị này</span>' : ''}</h4>
                        <p>${dev.location} • ${dev.lastActive}</p>
                    </div>
                </div>
                ${!dev.isCurrent ? `<button class="action-btn delete logout-device" data-id="${dev.id}" title="Đăng xuất thiết bị"><i class="fa-solid fa-right-from-bracket"></i></button>` : ''}
            </div>
        `).join('');

        // Sự kiện đăng xuất thiết bị
        deviceList.querySelectorAll('.logout-device').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                if (confirm('Bạn có muốn đăng xuất tài khoản khỏi thiết bị này không?')) {
                    document.getElementById(`device-${id}`).remove();
                    // Trong thực tế, bạn sẽ gọi Firebase Auth để revoke session
                }
            });
        });
    }

    // --- Logic Thay đổi mật khẩu ---
    const changePasswordBtn = document.getElementById('change-password-btn');
    if (changePasswordBtn) {
        changePasswordBtn.onclick = async (e) => {
            const btn = e.currentTarget;
            const originalHTML = btn.innerHTML;

            const currentPwd = document.getElementById('settings-current-password').value;
            const newPwd = document.getElementById('settings-new-password').value;
            const confirmPwd = document.getElementById('settings-confirm-password').value;

            if (!currentPwd || !newPwd || !confirmPwd) {
                alert('Vui lòng điền đầy đủ các trường mật khẩu.');
                return;
            }

            if (newPwd !== confirmPwd) {
                alert('Mật khẩu mới và xác nhận mật khẩu không khớp.');
                return;
            }

            if (newPwd.length < 6) {
                alert('Mật khẩu mới phải có ít nhất 6 ký tự.');
                return;
            }

            // Giả lập hiệu ứng lưu
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang cập nhật...';
            
            setTimeout(() => {
                alert('Mật khẩu đã được thay đổi thành công!');
                document.getElementById('settings-current-password').value = '';
                document.getElementById('settings-new-password').value = '';
                document.getElementById('settings-confirm-password').value = '';
                
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            }, 1500);
        };
    }

    const saveSettingsBtn = document.getElementById('save-settings-btn');
    saveSettingsBtn.onclick = async (e) => {
        e.preventDefault();
        const saveBtn = e.currentTarget;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

        try {
            await setDoc(doc(db, "userSettings", CURRENT_USER_ID), {
                emailNotifications: emailNotifToggle.checked,
                browserNotifications: browserNotifToggle.checked,
                language: languageSelect.value,
                currency: currencySelect.value,
                twoFactorAuth: twoFactorToggle ? twoFactorToggle.checked : false,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            alert('Cài đặt đã được lưu thành công!');
        } catch (error) {
            console.error("Lỗi cập nhật cài đặt:", error);
            alert('Có lỗi xảy ra khi lưu cài đặt.');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu cài đặt';
        }
    };

    // --- Logic Hồ sơ cá nhân (Profile) ---
    const profileForm = document.getElementById('user-profile-form');
    const photoInput = document.getElementById('profile-photo-url');
    const photoPreview = document.getElementById('profile-img-preview');
    const nameInput = document.getElementById('profile-display-name');

    async function loadUserProfile() {
        const userRef = doc(db, "users", CURRENT_USER_ID);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const data = userSnap.data();
            nameInput.value = data.displayName || '';
            photoInput.value = data.photoURL || '';
            photoPreview.src = data.photoURL || 'https://i.pravatar.cc/150';
        }
    }

    photoInput.addEventListener('input', (e) => {
        photoPreview.src = e.target.value || 'https://i.pravatar.cc/150';
    });

    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('save-profile-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

        try {
            await setDoc(doc(db, "users", CURRENT_USER_ID), {
                displayName: nameInput.value,
                photoURL: photoInput.value,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            alert('Cập nhật hồ sơ thành công!');
        } catch (error) {
            console.error("Lỗi cập nhật hồ sơ:", error);
            alert('Có lỗi xảy ra khi lưu thông tin.');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu thay đổi';
        }
    });

    // --- Logic cho "Sản phẩm đang bán" (Người bán) ---
    const listingsList = document.getElementById('my-listings-list');
    const qListings = query(collection(db, "products"), where("sellerId", "==", CURRENT_USER_ID));

    onSnapshot(qListings, (snapshot) => {
        listingsList.innerHTML = '';
        snapshot.forEach((docSnap) => {
            const product = { id: docSnap.id, ...docSnap.data() };
            const bidCount = product.history ? product.history.length : 0;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="manage-item-info">
                        <img src="${product.imageUrl}" alt="">
                        <div><strong>${product.name}</strong><span class="cat-tag">${product.category}</span></div>
                    </div>
                </td>
                <td><i class="fa-solid fa-users"></i> ${bidCount}</td>
                <td><strong>${window.Utils.formatCurrency(product.currentPrice)}</strong></td>
                <td><span class="status-pill leading">Đang đấu giá</span></td>
                <td>
                    <div class="manage-actions">
                        <a href="product-detail.html?id=${product.id}" class="action-btn view" title="Xem"><i class="fa-solid fa-eye"></i></a>
                        ${bidCount === 0 ? '<button class="action-btn" title="Sửa"><i class="fa-solid fa-pen"></i></button>' : ''}
                        <button class="action-btn" title="Ẩn"><i class="fa-solid fa-eye-slash"></i></button>
                    </div>
                </td>
            `;
            listingsList.appendChild(tr);
        });
    });

    // --- Logic cho "Cuộc đấu giá của tôi" (Người mua) ---
    // Lưu ý: Ở bản demo này, chúng ta tìm các sản phẩm mà user có trong lịch sử bid
    const bidsList = document.getElementById('my-bids-list');
    onSnapshot(collection(db, "products"), (snapshot) => {
        bidsList.innerHTML = '';
        let hasBids = false;

        snapshot.forEach((docSnap) => {
            const product = { id: docSnap.id, ...docSnap.data() };
            const history = product.history || [];
            
            // Tìm bid cao nhất của user trong sản phẩm này
            const userBids = history.filter(h => h.user.includes(CURRENT_USER_NAME));
            if (userBids.length > 0) {
                hasBids = true;
                const userMaxBid = Math.max(...userBids.map(b => b.amount));
                const isLeading = product.currentPrice === userMaxBid;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div class="manage-item-info">
                            <img src="${product.imageUrl}" alt="">
                            <div><strong>${product.name}</strong></div>
                        </div>
                    </td>
                    <td><strong>${window.Utils.formatCurrency(product.currentPrice)}</strong></td>
                    <td style="color: var(--primary); font-weight: 600;">${window.Utils.formatCurrency(userMaxBid)}</td>
                    <td><span class="timer-countdown" data-seconds="${product.timeRemainingSeconds}">--:--:--</span></td>
                    <td>
                        <span class="status-pill ${isLeading ? 'leading' : 'outbid'}">
                            ${isLeading ? 'Đang dẫn đầu' : 'Bị vượt mặt'}
                        </span>
                    </td>
                `;
                bidsList.appendChild(tr);

                // Khởi tạo timer cho dòng này
                const timerElem = tr.querySelector('.timer-countdown');
                if (window.AuctionTimer) {
                    new window.AuctionTimer(product.timeRemainingSeconds, (time) => {
                        timerElem.innerText = time;
                    }, () => {
                        timerElem.innerText = "Kết thúc";
                        timerElem.closest('tr').querySelector('.status-pill').className = 'status-pill ended';
                        timerElem.closest('tr').querySelector('.status-pill').innerText = 'Đã kết thúc';
                    }).start();
                }
            }
        });

        if (!hasBids) {
            bidsList.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Bạn chưa tham gia đấu giá sản phẩm nào.</td></tr>';
        }
    });
    }
});