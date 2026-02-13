// Firebase 配置
// 请将下方配置替换为你自己的 Firebase 项目配置
const firebaseConfig = {
    apiKey: "AIzaSyAu5RMyGx7noHk-oxPpmrhdFM2c-jeilyI",
    authDomain: "awaron-10124.firebaseapp.com",
    databaseURL: "https://awaron-10124-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "awaron-10124",
    storageBucket: "awaron-10124.firebasestorage.app",
    messagingSenderId: "596736139405",
    appId: "1:596736139405:web:38f9e6a27bb90ec16d02c4",
    measurementId: "G-EY6YL4BRF7"
};

// 初始化 Firebase
firebase.initializeApp(firebaseConfig);

// 获取数据库引用
const database = firebase.database();
