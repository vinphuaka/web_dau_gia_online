import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { collection, onSnapshot, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const activeTimers = {};

    // 1. Kiểm tra trạng thái đăng nhập và hiển thị trang Admin
    onAuthStateChanged(auth, (user) => {
        if (user) {
            document.body.style.display = 'block';
            const adminNameElem = document.getElementById('admin-name');
            if (adminNameElem) adminNameElem.innerText = user.displayName || user.email;
            initAdmin();
        } else {
            window.location.href = 'login.html';
        }
    });

    function initAdmin() {
        initNavigation();
        loadStats();
        loadProducts();
        loadUsers();
        if (typeof Chart !== 'undefined') initCharts();
    }

    // 2. Điều hướng giữa các Tab trong trang quản trị
    function initNavigation() {
        const sidebarItems = document.querySelectorAll('.sidebar-menu li[data-nav]');
        const sections = {
            'admin-overview': document.getElementById('section-admin-overview'),
            'admin-users': document.getElementById('section-admin-users'),
            'admin-products': document.getElementById('section-admin-products')
        };

        sidebarItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const nav = item.dataset.nav;
                if (!nav || !sections[nav]) return;

                sidebarItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                Object.keys(sections).forEach(key => {
                    sections[key].style.display = (key === nav) ? 'block' : 'none';
                });
            });
        });

        document.getElementById('admin-logout-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('Bạn muốn đăng xuất khỏi quyền quản trị?')) {
                signOut(auth).then(() => window.location.href = 'index.html');
            }
        });
    }

    // 3. Hiển thị thống kê nhanh (Số lượng User, Sản phẩm)
    async function loadStats() {
        const userSnap = await getDocs(collection(db, "users"));
        const prodSnap = await getDocs(collection(db, "products"));
        
        document.getElementById('stat-total-users').innerText = userSnap.size;
        document.getElementById('stat-total-prods').innerText = prodSnap.size;
    }

    // 4. QUAN TRỌNG: Quản lý sản phẩm và tính năng đếm ngược (Countdown)
    function loadProducts() {
        const productList = document.getElementById('admin-product-list');
        if (!productList) return;

        const q = query(collection(db, "products"), orderBy("createdAt", "desc"));

        onSnapshot(q, (snapshot) => {
            productList.innerHTML = '';
            
            snapshot.forEach(docSnap => {
                const product = { id: docSnap.id, ...docSnap.data() };
                const tr = document.createElement('tr');
                
                tr.innerHTML = `
                    <td>
                        <div class="manage-item-info">
                            <img src="${product.imageUrl || 'https://placehold.co/50'}" alt="">
                            <div><strong>${product.name}</strong><span class="cat-tag">${product.category || 'Chung'}</span></div>
                        </div>
                    </td>
                    <td><small>${product.sellerId ? product.sellerId.substring(0,8) + '...' : 'System'}</small></td>
                    <td><strong>${window.Utils.formatCurrency(product.startPrice || 0)}</strong></td>
                    <td><span class="countdown-timer" data-id="${product.id}">--:--:--</span></td>
                    <td><span class="status-pill leading">Đang đấu giá</span></td>
                    <td>
                        <div class="manage-actions">
                            <a href="product-detail.html?id=${product.id}" class="action-btn view" title="Xem"><i class="fa-solid fa-eye"></i></a>
                            <button class="action-btn delete" title="Xóa"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                `;
                productList.appendChild(tr);

                // Khởi tạo Timer cho từng dòng
                const timerElem = tr.querySelector(`.countdown-timer[data-id="${product.id}"]`);
                const remaining = Number(product.timeRemainingSeconds) || 0;

                if (window.AuctionTimer && remaining > 0) {
                    if (activeTimers[product.id]) activeTimers[product.id].stop();

                    const timer = new window.AuctionTimer(remaining, (timeStr) => {
                        timerElem.innerText = timeStr;
                    }, () => {
                        timerElem.innerText = "HẾT GIỜ";
                        const status = tr.querySelector('.status-pill');
                        if (status) {
                            status.className = 'status-pill ended';
                            status.innerText = 'Đã kết thúc';
                        }
                    });
                    timer.start();
                    activeTimers[product.id] = timer;
                } else {
                    timerElem.innerText = "Đã kết thúc";
                }
            });
        });
    }

    // 5. Hiển thị danh sách người dùng
    function loadUsers() {
        const userList = document.getElementById('admin-user-list');
        if (!userList) return;
        onSnapshot(collection(db, "users"), (snapshot) => {
            userList.innerHTML = '';
            snapshot.forEach(docSnap => {
                const user = docSnap.data();
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${user.displayName || 'User'}</td><td>User</td><td>Active</td><td>N/A</td><td>-</td>`;
                userList.appendChild(tr);
            });
        });
    }

    // 6. Khởi tạo biểu đồ doanh thu (Dữ liệu mẫu)
    function initCharts() {
        const ctx = document.getElementById('revenueChart');
        if (!ctx) return;
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11'],
                datasets: [{ label: 'Doanh thu (VNĐ)', data: [150, 280, 320, 290, 480, 520], borderColor: '#0ea5e9', fill: true, tension: 0.4 }]
            }
        });
    }
});