import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { collection, query, where, onSnapshot, doc, getDoc, deleteDoc, updateDoc, getCountFromServer } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- Kiểm tra quyền Admin khi vào trang ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Kiểm tra ID Admin cố định hoặc vai trò admin trong Firestore
            const isSuperAdmin = (user.uid === 'a2cfQr0YU3Zh4bzTMmNegH9tH1p1');
            let isAdminRole = false;

            if (!isSuperAdmin) {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                isAdminRole = userDoc.exists() && userDoc.data().role === 'admin';
            }

            if (isSuperAdmin || isAdminRole) {
                // Nếu hợp lệ, hiển thị giao diện và tải dữ liệu
                document.body.style.display = 'block';
                loadStats();
                initRevenueChart();
            } else {
                alert("Cảnh báo: Bạn không có quyền truy cập trang quản trị!");
                window.location.href = 'index.html';
            }
        } else {
            // Chưa đăng nhập thì về trang login
            window.location.href = 'login.html';
        }
    });

    // --- Logic Chuyển mục Sidebar ---
    const sidebarItems = document.querySelectorAll('.sidebar-menu li');
    const adminSections = {
        'admin-overview': document.getElementById('section-admin-overview'),
        'admin-users': document.getElementById('section-admin-users'),
        'admin-products': document.getElementById('section-admin-products')
    };

    sidebarItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const nav = item.dataset.nav;
            if (!nav || !adminSections[nav]) return;

            sidebarItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            Object.keys(adminSections).forEach(key => {
                adminSections[key].style.display = (key === nav) ? 'block' : 'none';
            });

            if (nav === 'admin-overview') { loadStats(); initRevenueChart(); }
            if (nav === 'admin-users') loadUsers();
            if (nav === 'admin-products') loadProducts();
        });
    });

    // --- Sự kiện Đăng xuất ---
    const logoutBtn = document.getElementById('admin-logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = (e) => {
            e.preventDefault();
            if (confirm('Bạn có muốn đăng xuất khỏi hệ thống quản trị không?')) {
                signOut(auth).then(() => window.location.href = 'index.html');
            }
        };
    }

    // --- 1. Thống kê Overview ---
    async function loadStats() {
        const usersCount = await getCountFromServer(collection(db, "users"));
        const prodsCount = await getCountFromServer(collection(db, "products"));
        document.getElementById('stat-total-users').innerText = usersCount.data().count;
        document.getElementById('stat-total-prods').innerText = prodsCount.data().count;
    }

    // --- 4. Biểu đồ doanh thu ---
    let revenueChart = null;
    function initRevenueChart() {
        const canvas = document.getElementById('revenueChart');
        if (!canvas) return;

        // Lấy các giao dịch loại "in" (doanh thu)
        const q = query(collection(db, "transactions"), where("type", "==", "in"));
        
        onSnapshot(q, (snapshot) => {
            const months = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];
            const monthlyRevenue = new Array(12).fill(0);

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.date) {
                    const date = new Date(data.date);
                    monthlyRevenue[date.getMonth()] += (data.amount || 0);
                }
            });

            if (revenueChart) {
                revenueChart.data.datasets[0].data = monthlyRevenue;
                revenueChart.update();
            } else {
                revenueChart = new Chart(canvas, {
                    type: 'line',
                    data: {
                        labels: months,
                        datasets: [{
                            label: 'Doanh thu (VND)',
                            data: monthlyRevenue,
                            borderColor: '#0ea5e9',
                            backgroundColor: 'rgba(14, 165, 233, 0.1)',
                            fill: true,
                            tension: 0.4,
                            borderWidth: 3,
                            pointRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: function(value) {
                                        return window.Utils.formatCurrency(value);
                                    }
                                }
                            }
                        }
                    }
                });
            }
        });
    }

    // --- 2. Quản lý Người dùng ---
    function loadUsers() {
        const userList = document.getElementById('admin-user-list');
        onSnapshot(collection(db, "users"), (snapshot) => {
            userList.innerHTML = '';
            snapshot.forEach(docSnap => {
                const user = { id: docSnap.id, ...docSnap.data() };
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div class="manage-item-info">
                            <img src="${user.photoURL || 'https://i.pravatar.cc/150'}" alt="">
                            <div><strong>${user.displayName || 'Chưa đặt tên'}</strong><span class="cat-tag">${user.email || 'No Email'}</span></div>
                        </div>
                    </td>
                    <td><span class="status-badge role-user">User</span></td>
                    <td><span class="status-badge active">Hoạt động</span></td>
                    <td>${user.updatedAt ? new Date(user.updatedAt).toLocaleDateString('vi-VN') : '---'}</td>
                    <td>
                        <div class="manage-actions">
                            <button class="action-btn" title="Khóa tài khoản"><i class="fa-solid fa-ban"></i></button>
                            <button class="action-btn delete" title="Xóa vĩnh viễn"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                `;
                userList.appendChild(tr);
            });
        });
    }

    // --- 3. Quản lý Sản phẩm ---
    function loadProducts() {
        const prodList = document.getElementById('admin-product-list');
        onSnapshot(collection(db, "products"), (snapshot) => {
            prodList.innerHTML = '';
            snapshot.forEach(docSnap => {
                const product = { id: docSnap.id, ...docSnap.data() };
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div class="manage-item-info">
                            <img src="${product.imageUrl}" alt="">
                            <div><strong>${product.name}</strong><span class="cat-tag">${product.category}</span></div>
                        </div>
                    </td>
                    <td>${product.sellerId}</td>
                    <td><strong>${window.Utils.formatCurrency(product.startPrice)}</strong></td>
                    <td><span class="status-pill leading">Đang bán</span></td>
                    <td>
                        <div class="manage-actions">
                            <a href="product-detail.html?id=${product.id}" class="action-btn view"><i class="fa-solid fa-eye"></i></a>
                            <button class="action-btn delete" data-id="${product.id}"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </td>
                `;

                // Sự kiện xóa sản phẩm
                tr.querySelector('.delete').onclick = async () => {
                    if(confirm('Bạn có chắc muốn gỡ sản phẩm này khỏi sàn?')) {
                        await deleteDoc(doc(db, "products", product.id));
                    }
                };

                prodList.appendChild(tr);
            });
        });
    }
});