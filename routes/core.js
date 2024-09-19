var express = require('express');
var axios = require('axios');
var fs = require('fs');
const path = require('path');
var router = express.Router();
const connection = require('../config/db');

// Route để tải ảnh
router.post('/download_img', (req, res) => {
  return false;
  const query = `
    SELECT latin_name FROM species
  `;
  connection.query(query, (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: err });
      return;
    }

    // Gọi hàm tải tất cả hình ảnh và trả về thông báo
    downloadAllImages(results)
      .then(() => {
        res.json({ msg: 'Đang tải ảnh' });
      })
      .catch((err) => {
        console.error('Error downloading images:', err);
        res.status(500).json({ error: err });
      });
  });
});

// Hàm chính để tải tất cả hình ảnh
async function downloadAllImages(data) {
  for (const snake of data) {
    await downloadImages(snake); // Truyền toàn bộ đối tượng `snake`
  }
}

// Hàm tìm kiếm taxon_id từ tên loài
async function getTaxonId(snake) {
  try {
    const response = await axios.get('https://api.inaturalist.org/v1/taxa', {
      params: { q: snake.latin_name } // Truy cập đúng thuộc tính latin_name
    });

    if (response.data.results.length > 0) {
      const taxon = response.data.results[0];
      return taxon.id; // Trả về taxon_id
    } else {
      console.log(`Không tìm thấy thông tin cho ${snake.latin_name}`);
      return null;
    }
  } catch (error) {
    console.error(`Lỗi khi tìm kiếm taxon_id cho ${snake.latin_name}:`, error.message);
    return null;
  }
}

// Hàm tải hình ảnh từ iNaturalist dựa trên taxon_id
async function downloadImages(snake) {
  try {
    const taxonId = await getTaxonId(snake); // Lấy taxon_id từ tên loài
    if (!taxonId) return;

    const response = await axios.get(`https://api.inaturalist.org/v1/observations`, {
      params: {
        taxon_id: taxonId,
        per_page: 70, // Yêu cầu tối đa 70 kết quả
        order_by: 'created_at',
        photos: true
      }
    });

    const observations = response.data.results;

    if (observations.length > 0) {
      let imageCount = 0;
      for (const observation of observations) {
        if (observation.photos && observation.photos.length > 0) {
          for (const photo of observation.photos) {
            const imageUrl = photo.url.replace('square', 'large'); // Lấy ảnh lớn thay vì ảnh nhỏ
            const imageResponse = await axios.get(imageUrl, { responseType: 'stream' });

            // Tạo đường dẫn lưu ảnh, mỗi loài sẽ có thư mục riêng trong thư mục 'images'
            const folderPath = path.resolve(__dirname, 'images', snake.latin_name);
            const filePath = path.resolve(folderPath, `${snake.latin_name}_${imageCount + 1}.jpg`);

            // Tạo thư mục nếu chưa tồn tại
            fs.mkdirSync(folderPath, { recursive: true });

            // Lưu ảnh vào file
            const writer = fs.createWriteStream(filePath);
            imageResponse.data.pipe(writer);

            console.log(`Đã tải ảnh ${imageCount + 1} của (${snake.latin_name}) thành công!`);

            await new Promise((resolve, reject) => {
              writer.on('finish', resolve);
              writer.on('error', reject);
            });

            imageCount++;
            if (imageCount >= 70) break; // Chỉ tải tối đa 70 ảnh
          }
        }
        if (imageCount >= 70) break; // Nếu đủ 70 ảnh, thoát khỏi vòng lặp
      }

      if (imageCount === 0) {
        console.log(`Không tìm thấy ảnh nào cho ${snake.latin_name}`);
      }
    } else {
      console.log(`Không tìm thấy quan sát nào cho ${snake.latin_name}`);
    }
  } catch (error) {
    console.error(`Lỗi khi tải ảnh cho ${snake.latin_name}:`, error.message);
  }
}

module.exports = router;
