var express = require('express');
const { SitemapStream, streamToPromise } = require('sitemap');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
var router = express.Router();
const connection = require('../config/db');
const { checkToxin, stripHtmlAndEscape } = require('../utils/utils');
const { default: axios } = require('axios');
router.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send("User-agent: *\nAllow: /\nDisallow: /private/");
});




router.get('/sitemap.xml', async (req, res) => {
  try {
    // Truy vấn để lấy tất cả các slug của rắn
    const snakeQuery = `
      SELECT slug
      FROM species
      WHERE published = 1
    `;

    connection.query(snakeQuery, async (err, results) => {
      if (err) {
        console.error('Database query error:', err);
        res.status(500).end();
        return;
      }

      // Tạo mảng các URL
      const links = results.map(snake => ({
        url: `/chi-tiet/${snake.slug}`,
        changefreq: 'weekly',
        priority: 0.7
      }));

      // Thêm trang chủ và các trang tĩnh khác
      links.unshift(
        { url: '/', changefreq: 'daily', priority: 1 },
        { url: '/about', changefreq: 'monthly', priority: 0.5 }
        // Thêm các trang khác nếu cần
      );

      // Tạo stream
      const stream = new SitemapStream({ hostname: 'https://hoangnha.site' });

      // Pipe URL vào stream
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      const sitemapOutput = await streamToPromise(Readable.from(links).pipe(stream));

      // Trả về XML
      res.end(sitemapOutput.toString());
    });
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});
/* GET home page. */
router.get('/', function (req, res, next) {
  const provinceName = req.query.province;
  const latitude = parseFloat(req.query.lat);
  const longitude = parseFloat(req.query.lng);
  const radius = parseFloat(req.query.radius) || 50; // Mặc định 50km
  const orderId = req.query.order_id || 2;

  const q = req.query.q;
  const isTable = req.query.table;

  const page = parseInt(req.query.page) || 1; // Trang hiện tại, mặc định là 1
  const limit = parseInt(req.query.limit) || 30; // Số lượng loài mỗi trang, mặc định là 20
  const offset = (page - 1) * limit; // Bỏ qua bao nhiêu kết quả

  let speciesQuery = `
    SELECT DISTINCT s.*, t.toxin_name, f.family_name, o.order_name
    FROM species s
    LEFT JOIN toxins t ON s.toxin_id = t.toxin_id
    LEFT JOIN species_provinces sp ON s.species_id = sp.species_id
    LEFT JOIN provinces p ON sp.province_id = p.province_id
    LEFT JOIN families f ON s.family_id = f.family_id
    LEFT JOIN orders o ON f.order_id = o.order_id
    WHERE s.published = 1
  `;

  let queryParams = [];

  if (orderId) {
    speciesQuery += ` AND f.order_id = ?`;
    queryParams.push(orderId);
  }

  if (provinceName) {
    speciesQuery += ` AND p.name LIKE ?`;
    queryParams.push(`%${provinceName}%`);
  } else if (!isNaN(latitude) && !isNaN(longitude)) {
    speciesQuery += `
      AND ST_Distance_Sphere(
        point(p.longitude, p.latitude),
        point(?, ?)
      ) <= ?
    `;
    queryParams.push(longitude, latitude, radius * 1000); // Chuyển đổi km thành m
  }

  if (q) {
    speciesQuery += `
      AND (
        s.vietnamese_name LIKE ? OR
        s.english_name LIKE ? OR
        s.latin_name LIKE ? OR
        s.other_name LIKE ?
      )
    `;
    const searchTerm = `%${q}%`;
    queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  // Thêm LIMIT và OFFSET vào truy vấn
  speciesQuery += ` LIMIT ? OFFSET ?`;
  queryParams.push(limit, offset);

  const imagesQuery = `
    SELECT i.species_id, i.image_url, i.description as image_description
    FROM images i
  `;

  const colorsQuery = `
    SELECT sc.species_id, c.color_name, c.color_code
    FROM species_colors sc
    LEFT JOIN colors c ON sc.color_id = c.color_id
  `;

  // Truy vấn để đếm tổng số loài (để tính tổng số trang)
  const countQuery = `
    SELECT COUNT(DISTINCT s.species_id) as total
    FROM species s
    LEFT JOIN species_provinces sp ON s.species_id = sp.species_id
    LEFT JOIN provinces p ON sp.province_id = p.province_id
    LEFT JOIN families f ON s.family_id = f.family_id
    LEFT JOIN orders o ON f.order_id = o.order_id
    WHERE s.published = 1 AND o.order_id = 2
  `;

  // Đếm tổng số loài để phân trang
  connection.query(countQuery, queryParams, (err, countResults) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: err });
      return;
    }

    const totalSpecies = countResults[0].total;
    const totalPages = Math.ceil(totalSpecies / limit);

    connection.query(speciesQuery, queryParams, (err, speciesResults) => {
      if (err) {
        console.error('Database query error:', err);
        res.status(500).json({ error: err });
        return;
      }

      connection.query(imagesQuery, (err, imageResults) => {
        if (err) {
          console.error('Database query error:', err);
          res.status(500).json({ error: err });
          return;
        }

        connection.query(colorsQuery, (err, colorResults) => {
          if (err) {
            console.error('Database query error:', err);
            res.status(500).json({ error: err });
            return;
          }

          // Nhóm các ảnh và màu theo species_id
          const speciesWithImagesAndColors = speciesResults.map(species => {
            const images = imageResults.filter(image => image.species_id === species.species_id);
            const colors = colorResults.filter(color => color.species_id === species.species_id);

            return {
              ...species,
              images: images.map(image => ({
                image_url: image.image_url,
                image_description: image.image_description
              })),
              colors: colors.map(color => ({
                color_name: color.color_name,
                color_code: color.color_code
              }))
            };
          });

          const processedData = speciesWithImagesAndColors.map(item => ({
            ...item,
            isToxin: checkToxin(item.toxin_name)
          }));


          // res.json(processedData)
          // return;

          res.render('index', {
            data: processedData,
            isTable,
            q,
            page,
            totalSpecies,
            totalPages, // Trả về tổng số trang để hiển thị phân trang trên giao diện
          });
        });
      });
    });
  });

});


router.get('/nhan-dien-ran', function (req, res, next) {
  res.render('detection', {});
})


// Function to save Base64 image and return the file path
function saveBase64Image(base64Data) {
  return new Promise((resolve, reject) => {
    const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Image, 'base64');
    let uniqueName = new Date();


    // Define the file path and ensure the directory exists
    const filePath = path.resolve(__dirname, 'uploads', uniqueName.toTimeString() + 'uploaded_image.jpg');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    // Write the buffer to the file
    fs.writeFile(filePath, buffer, (err) => {
      if (err) {
        return reject(err);
      }
      resolve(filePath);
    });
  });
}

router.post('/detection', async function (req, res, next) {
  const { image } = req.body;

  if (!image) {
    return res.status(400).json({ msg: 'No image data received' });
  }
  const query = `
  SELECT * FROM setup 
  `;
  connection.query(query, [req.params.id], async (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: err });
      return;
    }
    const token = results[0].value;
    try {
      // Save the Base64 image as a file
      const filePath = await saveBase64Image(image);

      // Create FormData and append the saved image file
      const formData = new FormData();
      formData.append('image', fs.createReadStream(filePath));
      formData.append('taxon_id', 85553);

      // Create an Axios instance for the external API request
      const client = axios.create({
        headers: {
          ...formData.getHeaders(), // Ensure headers are set correctly for FormData
          'Authorization': `Bearer ${token}`, // Replace with your actual token
        },
      });

      // Send the image to the external API
      const response = await client.post('https://api.inaturalist.org/v1/computervision/score_image', formData);

      // Respond to the client with the API response
      res.json({ msg: 'Image saved and sent successfully', data: response.data });

    } catch (error) {
      console.error('Error processing image:', error);
      res.status(500).json({ msg: 'Error processing image' });
    }
  });


});



router.get('/gioi-thieu', function (req, res, next) {
  res.render('about', {});
})

router.get('/chi-tiet/:slug', function (req, res, next) {
  const speciesSlug = req.params.slug;

  if (!speciesSlug) {
    res.status(400).json({ error: "species_slug is required" });
    return;
  }

  // Truy vấn chi tiết loài sử dụng slug thay vì species_id
  const speciesDetailQuery = `
    SELECT s.*, t.toxin_name, f.family_name, o.order_name
    FROM species s
    LEFT JOIN toxins t ON s.toxin_id = t.toxin_id
    LEFT JOIN families f ON s.family_id = f.family_id
    LEFT JOIN orders o ON f.order_id = o.order_id
    WHERE s.slug = ?
  `;

  const imagesQuery = `
    SELECT i.species_id, i.image_url, i.description as image_description
    FROM images i
    WHERE i.species_id = (SELECT species_id FROM species WHERE slug = ?)
  `;

  const colorsQuery = `
    SELECT sc.species_id, c.color_name, c.color_code
    FROM species_colors sc
    LEFT JOIN colors c ON sc.color_id = c.color_id
    WHERE sc.species_id = (SELECT species_id FROM species WHERE slug = ?)
  `;

  // Truy vấn để lấy danh sách tỉnh thành nơi có loài này
  const provincesQuery = `
  SELECT p.name AS province_name, p.latitude, p.longitude
  FROM species_provinces sp
  LEFT JOIN provinces p ON sp.province_id = p.province_id
  WHERE sp.species_id = (SELECT species_id FROM species WHERE slug = ?)
`;


  // Thực hiện truy vấn để lấy chi tiết loài dựa trên slug
  connection.query(speciesDetailQuery, [speciesSlug], (err, speciesResult) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: err });
      return;
    }

    if (speciesResult.length === 0) {
      res.status(404).json({ error: 'Species not found' });
      return;
    }

    const speciesId = speciesResult[0].species_id;

    // Thực hiện truy vấn để lấy ảnh của loài
    connection.query(imagesQuery, [speciesSlug], (err, imageResults) => {
      if (err) {
        console.error('Database query error:', err);
        res.status(500).json({ error: err });
        return;
      }

      // Thực hiện truy vấn để lấy màu sắc của loài
      connection.query(colorsQuery, [speciesSlug], (err, colorResults) => {
        if (err) {
          console.error('Database query error:', err);
          res.status(500).json({ error: err });
          return;
        }

        // Thực hiện truy vấn để lấy danh sách tỉnh thành nơi có loài này
        connection.query(provincesQuery, [speciesSlug], (err, provinceResults) => {
          if (err) {
            console.error('Database query error:', err);
            res.status(500).json({ error: err });
            return;
          }

          const species = speciesResult[0];

          // Tạo đối tượng speciesDetails với các thông tin liên quan
          const speciesDetails = {
            ...species,
            images: imageResults.map(image => ({
              image_url: image.image_url,
              image_description: image.image_description
            })),
            colors: colorResults.map(color => ({
              color_name: color.color_name,
              color_code: color.color_code
            })),
            provinces: provinceResults, // Danh sách tỉnh thành
            isToxin: checkToxin(species.toxin_name)
          };

          // Xử lý mô tả, môi trường sống và thức ăn không chứa HTML
          noHtmldescription = stripHtmlAndEscape(speciesDetails.description);
          noHtmlhabitat = stripHtmlAndEscape(speciesDetails.habitat);
          noHtmlfood = stripHtmlAndEscape(speciesDetails.food);

          // Trả về kết quả JSON
          // res.json(speciesDetails);

          // Hoặc render ra trang chi tiết
          res.render('detail', { data: speciesDetails, noHtmldescription, noHtmlhabitat, noHtmlfood });
        });
      });
    });
  });
});


module.exports = router;
