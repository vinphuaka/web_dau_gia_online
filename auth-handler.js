import { auth, db } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    updateProfile,
    GoogleAuthProvider,
    FacebookAuthProvider,
    signInWithPopup,
    sendPasswordResetEmail,
    signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const authCard = document.querySelector('.auth-card');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const googleLoginBtn = document.getElementById('google-login-btn');
    const facebookLoginBtn = document.getElementById('facebook-login-btn');
    const forgotPasswordLink = document.getElementById('forgot-password-link');

    // Helper: Đồng bộ thông tin người dùng vào Firestore
    async function syncUserToFirestore(user, nameFromForm = null) {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        
        const userData = {
            displayName: nameFromForm || user.displayName || 'Người dùng mới',
            email: user.email,
            photoURL: user.photoURL || '',
            lastLogin: new Date().toISOString()
        };

        // Nếu là người dùng mới đăng nhập lần đầu, thiết lập vai trò
        if (!userSnap.exists()) {
            if (user.email && (user.email.startsWith('admin@') || user.email === 'admin@bidmaster.com')) {
                userData.role = 'admin';
            } else {
                userData.role = 'user';
            }
            userData.createdAt = new Date().toISOString();
        }

        await setDoc(userRef, userData, { merge: true });
    }

    // Helper: Điều hướng dựa trên vai trò (Admin -> admin.html, User -> dashboard.html)
    async function redirectByUserRole(uid) {
        // Kiểm tra ID Admin cố định
        if (uid === 'a2cfQr0YU3Zh4bzTMmNegH9tH1p1') {
            console.log("Xác nhận Super Admin ID. Đang chuyển hướng...");
            window.location.href = 'admin.html';
            return;
        }

        const userDoc = await getDoc(doc(db, "users", uid));
        const userData = userDoc.exists() ? userDoc.data() : null;
        
        console.log("Quyền truy cập của người dùng:", userData?.role || "Không xác định");

        if (userData && userData.status === 'banned') {
            alert("Tài khoản của bạn đã bị khóa bởi quản trị viên!");
            await signOut(auth);
            if (authCard) authCard.classList.remove('skeleton');
            return;
        }

        if (userData && userData.role === 'admin') {
            window.location.href = 'admin.html';
        } else {
            window.location.href = 'dashboard.html';
        }
    }

    // Xử lý Đăng ký
    if (registerForm) {
        registerForm.onsubmit = async (e) => {
            e.preventDefault();
            authCard.classList.add('skeleton');
            const name = document.getElementById('reg-name').value;
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;

            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // Cập nhật tên hiển thị trong Auth
                await updateProfile(user, { displayName: name });

                // Lưu thông tin vào Firestore
                await syncUserToFirestore(user, name);

                alert('Đăng ký tài khoản thành công!');
                await redirectByUserRole(user.uid);
            } catch (error) {
                authCard.classList.remove('skeleton');
                alert('Lỗi đăng ký: ' + error.message);
            }
        };
    }

    // Xử lý Đăng nhập
    if (loginForm) {
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            authCard.classList.add('skeleton');
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                // Đảm bảo thông tin người dùng được đồng bộ trước khi kiểm tra quyền
                await syncUserToFirestore(userCredential.user);
                alert('Đăng nhập thành công!');
                await redirectByUserRole(userCredential.user.uid);
            } catch (error) {
                authCard.classList.remove('skeleton');
                alert('Lỗi đăng nhập: ' + error.message);
            }
        };
    }

    // Xử lý Đăng nhập Google
    if (googleLoginBtn) {
        googleLoginBtn.onclick = async () => {
            const provider = new GoogleAuthProvider();
            // Yêu cầu Google hiển thị màn hình chọn tài khoản để tránh tự động đăng nhập
            provider.setCustomParameters({ prompt: 'select_account' });
            
            try {
                authCard.classList.add('skeleton');
                const result = await signInWithPopup(auth, provider);
                await syncUserToFirestore(result.user);
                await redirectByUserRole(result.user.uid);
            } catch (error) {
                authCard.classList.remove('skeleton');
                alert('Lỗi đăng nhập Google: ' + error.message);
            }
        };
    }

    // Xử lý Đăng nhập Facebook
    if (facebookLoginBtn) {
        facebookLoginBtn.onclick = async () => {
            const provider = new FacebookAuthProvider();
            try {
                authCard.classList.add('skeleton');
                const result = await signInWithPopup(auth, provider);
                await syncUserToFirestore(result.user);
                await redirectByUserRole(result.user.uid);
            } catch (error) {
                authCard.classList.remove('skeleton');
                alert('Lỗi đăng nhập Facebook: ' + error.message);
            }
        };
    }

    // Xử lý Quên mật khẩu
    if (forgotPasswordLink) {
        forgotPasswordLink.onclick = async (e) => {
            e.preventDefault();
            const email = prompt('Vui lòng nhập email của bạn để khôi phục mật khẩu:');
            if (email) {
                authCard.classList.add('skeleton');
                try {
                    await sendPasswordResetEmail(auth, email);
                    alert('Email khôi phục mật khẩu đã được gửi đến địa chỉ ' + email + '. Vui lòng kiểm tra hộp thư đến của bạn.');
                } catch (error) {
                    alert('Lỗi: ' + error.message);
                } finally {
                    authCard.classList.remove('skeleton');
                }
            } else if (email === '') {
                alert('Email không được để trống.');
            }
        };
    }

   
});