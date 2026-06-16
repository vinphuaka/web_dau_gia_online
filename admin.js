import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { collection, onSnapshot, query, orderBy, getDocs, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

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
        }
        initAdmin();
    });

    function initAdmin() {
        initNavigation();
        loadStats();
        loadProducts();
        loadUsers();
        loadReports();
        if (typeof Chart !== 'undefined') initCharts();
    }

    // 2. Điều hướng giữa các Tab trong trang quản trị
    function initNavigation() {
        const sidebarItems = document.querySelectorAll('.sidebar-menu li[data-nav]');
        const sections = {
            'admin-overview': document.getElementById('section-admin-overview'),
            'admin-users': document.getElementById('section-admin-users'),
            'admin-products': document.getElementById('section-admin-products'),
            'admin-reports': document.getElementById('section-admin-reports')
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

    // 4. Quản lý sản phẩm và tính năng đếm ngược (Countdown)
    function loadProducts() {
        const productList = document.getElementById('admin-product-list');
        if (!productList) return;

        let allProductsList = [];
        let currentFilter = 'Tất cả';

        const filterButtons = document.querySelectorAll('#section-admin-products .filter-pill');
        filterButtons.forEach(btn => {
            btn.onclick = (e) => {
                filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.innerText.trim();
                applyProductFilter();
            };
        });

        const applyProductFilter = () => {
            let filtered = [...allProductsList];
            if (currentFilter === 'Chờ duyệt') {
                filtered = allProductsList.filter(p => p.status === 'pending');
            } else if (currentFilter === 'Đang đấu giá') {
                filtered = allProductsList.filter(p => p.status !== 'pending' && window.Utils.calculateRemainingTime(p).seconds > 0);
            } else if (currentFilter === 'Đã kết thúc') {
                filtered = allProductsList.filter(p => p.status !== 'pending' && window.Utils.calculateRemainingTime(p).seconds <= 0);
            }
            renderProductTable(filtered);
        };

        const renderProductTable = (products) => {
            productList.innerHTML = '';
            
            if (products.length === 0) {
                productList.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px 0;">Không tìm thấy sản phẩm nào.</td>
                    </tr>
                `;
                return;
            }

            products.forEach(product => {
                const tr = document.createElement('tr');
                
                // Trạng thái sản phẩm
                let statusText = 'Đang đấu giá';
                let statusClass = 'status-pill leading';
                const timeData = window.Utils.calculateRemainingTime(product);
                
                if (product.status === 'pending') {
                    statusText = 'Chờ duyệt';
                    statusClass = 'status-pill pending';
                } else if (timeData.seconds <= 0) {
                    statusText = 'Đã kết thúc';
                    statusClass = 'status-pill ended';
                } else if (timeData.isComingSoon) {
                    statusText = 'Sắp đấu giá';
                    statusClass = 'status-pill pending';
                }

                // Các nút hành động
                let actionButtons = '';
                if (product.status === 'pending') {
                    actionButtons = `
                        <button class="action-btn approve" data-id="${product.id}" title="Duyệt sản phẩm"><i class="fa-solid fa-check"></i> Duyệt</button>
                        <button class="action-btn reject" data-id="${product.id}" title="Từ chối sản phẩm"><i class="fa-solid fa-xmark"></i> Từ chối</button>
                    `;
                } else {
                    actionButtons = `
                        <a href="product-detail.html?id=${product.id}" class="action-btn view" title="Xem"><i class="fa-solid fa-eye"></i></a>
                        <button class="action-btn delete" data-id="${product.id}" title="Xóa"><i class="fa-solid fa-trash"></i> Xóa</button>
                    `;
                }

                tr.innerHTML = `
                    <td>
                        <div class="manage-item-info">
                            <img src="${product.imageUrl || 'https://placehold.co/50'}" alt="" onerror="this.src='https://placehold.co/50'">
                            <div><strong>${product.name}</strong><span class="cat-tag">${product.category || 'Chung'}</span></div>
                        </div>
                    </td>
                    <td><small>${product.sellerId ? product.sellerId.substring(0,8) + '...' : 'System'}</small></td>
                    <td><strong>${window.Utils.formatCurrency(product.startPrice || 0)}</strong></td>
                    <td><span class="countdown-timer" data-id="${product.id}">--:--:--</span></td>
                    <td><span class="${statusClass}">${statusText}</span></td>
                    <td>
                        <div class="manage-actions">
                            ${actionButtons}
                        </div>
                    </td>
                `;
                productList.appendChild(tr);

                // Khởi tạo Timer cho từng dòng
                const timerElem = tr.querySelector(`.countdown-timer[data-id="${product.id}"]`);
                if (product.status === 'pending') {
                    timerElem.innerText = 'Chờ duyệt';
                } else {
                    const remaining = timeData.seconds;
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
                }
            });

            // Gán sự kiện click cho các nút Duyệt, Từ chối, Xóa
            productList.querySelectorAll('.action-btn.approve').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    if (confirm('Bạn có chắc chắn phê duyệt sản phẩm này lên sàn?')) {
                        try {
                            await updateDoc(doc(db, "products", id), {
                                status: "active",
                                createdAt: new Date().toISOString()
                            });
                            alert('Đã phê duyệt sản phẩm!');
                        } catch (error) {
                            alert('Lỗi phê duyệt: ' + error.message);
                        }
                    }
                };
            });

            productList.querySelectorAll('.action-btn.reject, .action-btn.delete').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    const isReject = btn.classList.contains('reject');
                    const confirmMsg = isReject 
                        ? 'Bạn có chắc chắn muốn từ chối và xóa sản phẩm này?' 
                        : 'Bạn có chắc chắn muốn xóa sản phẩm này khỏi hệ thống?';
                    
                    if (confirm(confirmMsg)) {
                        try {
                            await deleteDoc(doc(db, "products", id));
                            alert(isReject ? 'Đã từ chối và xóa sản phẩm!' : 'Đã xóa sản phẩm khỏi hệ thống!');
                        } catch (error) {
                            alert('Lỗi xóa sản phẩm: ' + error.message);
                        }
                    }
                };
            });
        };

        onSnapshot(collection(db, "products"), (snapshot) => {
            allProductsList = [];
            snapshot.forEach(docSnap => {
                allProductsList.push({ id: docSnap.id, ...docSnap.data() });
            });
            
            // Sắp xếp theo ngày tạo mới nhất lên đầu
            allProductsList.sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
                const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
                return dateB - dateA;
            });

            applyProductFilter();
            
            // Cập nhật thống kê nhanh
            const statProd = document.getElementById('stat-total-prods');
            if (statProd) {
                statProd.innerText = allProductsList.length;
            }
        }, (error) => {
            console.error("Lỗi khi tải danh sách sản phẩm:", error);
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
                userList.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px 0;">Không tìm thấy người dùng nào.</td>
                    </tr>
                `;
                return;
            }

            users.forEach(user => {
                const tr = document.createElement('tr');
                const isSelf = auth.currentUser && user.uid === auth.currentUser.uid;
                
                const statusText = user.status === 'banned' ? 'Bị khóa' : 'Hoạt động';
                const statusClass = user.status === 'banned' ? 'status-pill banned' : 'status-pill leading';
                const roleText = user.role === 'admin' ? 'Admin' : 'User';
                
                const createdAt = user.createdAt ? new Date(user.createdAt).toLocaleDateString('vi-VN') : 'Không rõ';

                // Nút Ban/Unban
                const banBtn = user.status === 'banned' 
                    ? `<button class="action-btn unban" data-uid="${user.uid}" ${isSelf ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} title="Mở khóa tài khoản"><i class="fa-solid fa-unlock"></i> Mở khóa</button>`
                    : `<button class="action-btn ban" data-uid="${user.uid}" ${isSelf ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} title="Khóa tài khoản"><i class="fa-solid fa-ban"></i> Khóa</button>`;
                
                // Nút chuyển vai trò
                const roleBtn = user.role === 'admin'
                    ? `<button class="action-btn role" data-uid="${user.uid}" ${isSelf ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} title="Hạ quyền xuống User"><i class="fa-solid fa-user-minus"></i> Hạ quyền</button>`
                    : `<button class="action-btn role" data-uid="${user.uid}" ${isSelf ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} title="Nâng quyền lên Admin"><i class="fa-solid fa-user-shield"></i> Nâng quyền</button>`;

                tr.innerHTML = `
                    <td>
                        <div>
                            <strong>${user.displayName || 'Người dùng'}</strong>
                            <div style="font-size: 0.8em; color: var(--text-muted);">${user.email || ''}</div>
                        </div>
                    </td>
                    <td><span class="role-tag" style="background: ${user.role === 'admin' ? '#ecfdf5' : '#f1f5f9'}; color: ${user.role === 'admin' ? 'var(--success)' : '#475569'}; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; font-weight: 600;">${roleText}</span></td>
                    <td><span class="${statusClass}">${statusText}</span></td>
                    <td>${createdAt}</td>
                    <td>
                        <div class="manage-actions">
                            ${banBtn}
                            ${roleBtn}
                        </div>
                    </td>
                `;
                userList.appendChild(tr);
            });

            // Gán sự kiện cho các nút Ban/Unban
            userList.querySelectorAll('.action-btn.ban, .action-btn.unban').forEach(btn => {
                btn.onclick = async (e) => {
                    const uid = btn.dataset.uid;
                    const isBan = btn.classList.contains('ban');
                    const confirmMsg = isBan 
                        ? 'Bạn có chắc chắn muốn khóa tài khoản này?' 
                        : 'Bạn có chắc chắn muốn mở khóa tài khoản này?';
                    
                    if (confirm(confirmMsg)) {
                        try {
                            await updateDoc(doc(db, "users", uid), {
                                status: isBan ? 'banned' : 'active'
                            });
                            alert(isBan ? 'Đã khóa tài khoản!' : 'Đã mở khóa tài khoản!');
                        } catch (error) {
                            alert('Lỗi thao tác: ' + error.message);
                        }
                    }
                };
            });

            // Gán sự kiện cho nút Toggle Role
            userList.querySelectorAll('.action-btn.role').forEach(btn => {
                btn.onclick = async (e) => {
                    const uid = btn.dataset.uid;
                    const targetUser = users.find(u => u.uid === uid);
                    if (!targetUser) return;
                    const isToUser = targetUser.role === 'admin';
                    const confirmMsg = isToUser 
                        ? 'Bạn có chắc chắn muốn hạ quyền tài khoản này xuống User?' 
                        : 'Bạn có chắc chắn muốn nâng quyền tài khoản này lên Admin?';
                    
                    if (confirm(confirmMsg)) {
                        try {
                            await updateDoc(doc(db, "users", uid), {
                                role: isToUser ? 'user' : 'admin'
                            });
                            alert(isToUser ? 'Đã hạ quyền xuống User!' : 'Đã nâng quyền lên Admin!');
                        } catch (error) {
                            alert('Lỗi thao tác: ' + error.message);
                        }
                    }
                };
            });
        };

        onSnapshot(collection(db, "users"), (snapshot) => {
            const users = [];
            snapshot.forEach(docSnap => {
                users.push({ uid: docSnap.id, ...docSnap.data() });
            });
            renderUsers(users);

            // Cập nhật thống kê nhanh
            const statUser = document.getElementById('stat-total-users');
            if (statUser) {
                statUser.innerText = users.length;
            }
        }, (error) => {
            console.warn("Lỗi tải danh sách users:", error);
            renderUsers([]);
        });
    }

    // 6. Quản lý Báo cáo vi phạm (Violations & Reports)
    function loadReports() {
        const reportList = document.getElementById('admin-report-list');
        if (!reportList) return;

        const renderReports = (reports) => {
            reportList.innerHTML = '';
            
            if (reports.length === 0) {
                reportList.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px 0;">Không có báo cáo vi phạm nào.</td>
                    </tr>
                `;
                return;
            }

            reports.forEach(report => {
                const tr = document.createElement('tr');
                const dateStr = report.createdAt 
                    ? new Date(report.createdAt).toLocaleString('vi-VN') 
                    : 'Không rõ';

                tr.innerHTML = `
                    <td>
                        <div>
                            <strong>${report.productName || 'Sản phẩm ẩn danh'}</strong>
                            <div style="font-size: 0.8em; color: var(--text-muted);">ID: ${report.productId || 'N/A'}</div>
                        </div>
                    </td>
                    <td>${report.reporterEmail || 'N/A'}</td>
                    <td>${report.reason || 'Không có lý do'}</td>
                    <td>${dateStr}</td>
                    <td>
                        <div class="manage-actions">
                            <button class="action-btn approve" data-action="ignore" data-id="${report.id}" title="Bỏ qua báo cáo"><i class="fa-solid fa-eye-slash"></i> Bỏ qua</button>
                            <button class="action-btn reject" data-action="remove-product" data-id="${report.id}" data-prod-id="${report.productId}" title="Gỡ sản phẩm"><i class="fa-solid fa-trash"></i> Gỡ</button>
                        </div>
                    </td>
                `;
                reportList.appendChild(tr);
            });

            // Gán sự kiện
            reportList.querySelectorAll('button[data-action="ignore"]').forEach(btn => {
                btn.onclick = async () => {
                    const reportId = btn.dataset.id;
                    if (confirm('Bạn muốn bỏ qua báo cáo này?')) {
                        try {
                            await deleteDoc(doc(db, "reports", reportId));
                            alert('Đã bỏ qua báo cáo.');
                        } catch (error) {
                            alert('Lỗi: ' + error.message);
                        }
                    }
                };
            });

            reportList.querySelectorAll('button[data-action="remove-product"]').forEach(btn => {
                btn.onclick = async () => {
                    const reportId = btn.dataset.id;
                    const prodId = btn.dataset.prodId;
                    if (confirm('Bạn có chắc chắn muốn xóa sản phẩm bị báo cáo này và xóa báo cáo?')) {
                        try {
                            if (prodId) {
                                await deleteDoc(doc(db, "products", prodId));
                            }
                            await deleteDoc(doc(db, "reports", reportId));
                            alert('Đã gỡ sản phẩm và xóa báo cáo.');
                        } catch (error) {
                            alert('Lỗi: ' + error.message);
                        }
                    }
                };
            });
        };

        onSnapshot(collection(db, "reports"), (snapshot) => {
            const reports = [];
            snapshot.forEach(docSnap => {
                reports.push({ id: docSnap.id, ...docSnap.data() });
            });
            // Sắp xếp báo cáo mới nhất lên đầu
            reports.sort((a, b) => {
                const dateA = new Date(a.createdAt || 0);
                const dateB = new Date(b.createdAt || 0);
                return dateB - dateA;
            });
            renderReports(reports);
        }, (error) => {
            console.warn("Lỗi tải danh sách báo cáo vi phạm:", error);
            renderReports([]);
        });
    }

    // 7. Khởi tạo biểu đồ doanh thu (Dữ liệu mẫu)
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