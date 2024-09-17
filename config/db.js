// db.js
const mysql = require('mysql2');

// Tạo pool kết nối
const pool = mysql.createPool({
  host: '178.16.139.195',     // Thay bằng thông tin của bạn
  user: 'newuser',          // Thay bằng thông tin của bạn
  password: 'newpassword',  // Thay bằng thông tin của bạn
  database: 'VNSnake', // Thay bằng thông tin của bạn
  port: 3306,
  waitForConnections: true,
  connectionLimit: 100, // Adjust as needed
  queueLimit: 0
});
// const pool = mysql.createPool({
//   host: 'localhost',
//   user: 'root',
//   password: 'root',
//   database: 'VNSnake',
//   port: 8889,
//   waitForConnections: true,
//   connectionLimit: 100,
//   queueLimit: 0
// });

// Xử lý lỗi kết nối
pool.on('error', (err) => {
  console.error('Database connection error:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    // Reconnect logic
    pool.getConnection((err, connection) => {
      if (err) {
        console.error('Error reconnecting to the database:', err);
        return;
      }
      console.log('Reconnected to the database as id ' + connection.threadId);
    });
  } else {
    throw err;
  }
});

// Export pool để có thể sử dụng ở các file khác
module.exports = pool;
