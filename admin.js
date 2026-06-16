import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { collection, onSnapshot, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const activeTimers = {};

    let adminInitialized = false;

    // Fallback: Mở khóa giao diện hiển thị ngay cả khi Firebase lỗi hoặc phản hồi chậm
    setTimeout(() => {
        if (!adminInitialized) {
            document.body.style.display = 'block';
            initAdmin();
        }
    }, 1500);

    // 1. Kiểm tra trạng thái đăng nhập và hiển thị trang Admin
    onAuthStateChanged(auth, (user) => {
        adminInitialized = true;
        document.body.style.display = 'block';
        if (user) {
            const adminNameElem = document.getElementById('admin-name');
            if (adminNameElem) adminNameElem.innerText = user.displayName || user.email;
        } else {
            console.warn("Đang xem giao diện Admin ở chế độ không đăng nhập.");
            // Tạm ẩn chuyển hướng về login.html để dễ dàng Test UI
        }
        initAdmin();
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
        try {
            const userSnap = await getDocs(collection(db, "users"));
            const prodSnap = await getDocs(collection(db, "products"));
            
            document.getElementById('stat-total-users').innerText = userSnap.size || 0;
            document.getElementById('stat-total-prods').innerText = prodSnap.size || 0;
        } catch (error) {
            console.warn("Không thể tải thống kê thực, kích hoạt dữ liệu mẫu.");
            document.getElementById('stat-total-users').innerText = "24";
            document.getElementById('stat-total-prods').innerText = "156";
        }
    }

    // 4. QUAN TRỌNG: Quản lý sản phẩm và tính năng đếm ngược (Countdown)
    function loadProducts() {
        const productList = document.getElementById('admin-product-list');
        if (!productList) return;

        const q = collection(db, "products");

        const renderProductTable = (products) => {
            productList.innerHTML = '';
            
            // Nếu không có sản phẩm nào, tự động thêm sản phẩm mẫu để hiển thị tạm
            if (products.length === 0) {
                products.push(
                    {
                        id: "mock_1",
                        name: "Rolex Submariner 1968 (Mẫu)",
                        category: "watch",
                        sellerId: "admin_demo",
                        startPrice: 450000000,
                        timeRemainingSeconds: 86400,
                        imageUrl: "https://images.unsplash.com/photo-1585123334904-845d60e97b29?w=600",
                        createdAt: new Date()
                    },
                    {
                        id: "mock_2",
                        name: "Bình Gốm Cổ Thế Kỷ 19 (Mẫu)",
                        category: "antiques",
                        sellerId: "admin_demo",
                        startPrice: 120000000,
                        timeRemainingSeconds: 0,
                        imageUrl: "https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=600",
                        createdAt: new Date(Date.now() - 86400000)
                    }
                );

                // Đồng bộ số lượng thống kê ở tab Tổng quan nếu đang dùng hàng mẫu
                const statProd = document.getElementById('stat-total-prods');
                if (statProd && statProd.innerText === "0") {
                    statProd.innerText = products.length;
                }
            }

            products.sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
                return dateB - dateA;
            });

            products.forEach(product => {
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
                    const status = tr.querySelector('.status-pill');
                    if (status) {
                        status.className = 'status-pill ended';
                        status.innerText = 'Đã kết thúc';
                    }
                }
            });
        };

        onSnapshot(q, (snapshot) => {
            const products = [];
            snapshot.forEach(docSnap => {
                products.push({ id: docSnap.id, ...docSnap.data() });
            });
            
            renderProductTable(products);
        }, (error) => {
            console.error("Lỗi khi tải danh sách sản phẩm:", error);
            // Kích hoạt hiển thị sản phẩm mẫu khi gặp lỗi (ví dụ: bị chặn quyền đọc)
            renderProductTable([]);
        });
    }

    // 5. Hiển thị danh sách người dùng
    function loadUsers() {
        const userList = document.getElementById('admin-user-list');
        if (!userList) return;

        const renderUsers = (users) => {
            userList.innerHTML = '';
            if (users.length === 0) {
                users.push(
                    { displayName: "Nguyễn Văn A (Mẫu)", email: "nva@gmail.com" },
                    { displayName: "Trần Thị B (Mẫu)", email: "ttb@gmail.com" }
                );
            }
            users.forEach(user => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${user.displayName || user.email || 'User'}</td><td>User</td><td><span class="status-pill leading">Active</span></td><td>Vừa xong</td><td>-</td>`;
                userList.appendChild(tr);
            });
        };

        onSnapshot(collection(db, "users"), (snapshot) => {
            const users = [];
            snapshot.forEach(docSnap => users.push(docSnap.data()));
            renderUsers(users);
        }, (error) => {
            console.warn("Lỗi tải danh sách users:", error);
            renderUsers([]);
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