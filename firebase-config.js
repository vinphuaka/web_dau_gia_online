import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// Cấu hình Firebase của bạn
const firebaseConfig = {
  apiKey: "AIzaSyCfo2JK81ZL9aG6vDVrANlIjld4HrLuHRU",
  authDomain: "web-dau-gia-online.firebaseapp.com",
  projectId: "web-dau-gia-online",
  storageBucket: "web-dau-gia-online.firebasestorage.app",
  messagingSenderId: "863395119810",
  appId: "1:863395119810:web:fcc1880e0829b625dc315b",
  measurementId: "G-DKNC97H19Y"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

// Export app để các file module khác có thể sử dụng (ví dụ: dùng Firestore, Auth)
export { app, analytics, db, storage, auth };