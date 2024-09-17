var express = require('express');
var router = express.Router();
const connection = require('../config/db');


router.get('/species', (req, res) => {
  const provinceName = req.query.province;
  const latitude = parseFloat(req.query.lat);
  const longitude = parseFloat(req.query.lng);
  const radius = parseFloat(req.query.radius) || 50; // Mặc định 50km

  let speciesQuery = `
    SELECT DISTINCT s.*, t.toxin_name
    FROM species s
    LEFT JOIN toxins t ON s.toxin_id = t.toxin_id
    LEFT JOIN species_provinces sp ON s.species_id = sp.species_id
    LEFT JOIN provinces p ON sp.province_id = p.province_id
  `;

  let queryParams = [];

  if (provinceName) {
    speciesQuery += ` WHERE p.name LIKE ?`;
    queryParams.push(`%${provinceName}%`);
  } else if (!isNaN(latitude) && !isNaN(longitude)) {
    speciesQuery += `
      WHERE ST_Distance_Sphere(
        point(p.longitude, p.latitude),
        point(?, ?)
      ) <= ?
    `;
    queryParams.push(longitude, latitude, radius * 1000); // Chuyển đổi km thành m
  }

  const imagesQuery = `
    SELECT i.species_id, i.image_url, i.description as image_description
    FROM images i
  `;

  const colorsQuery = `
    SELECT sc.species_id, c.color_name, c.color_code
    FROM species_colors sc
    LEFT JOIN colors c ON sc.color_id = c.color_id
  `;

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

        // Nhóm các ảnh theo species_id
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

        res.json(speciesWithImagesAndColors);
      });
    });
  });
});



router.get('/species-published', (req, res) => {
  const provinceName = req.query.province;
  const latitude = parseFloat(req.query.lat);
  const longitude = parseFloat(req.query.lng);
  const radius = parseFloat(req.query.radius) || 50; // Mặc định 50km
  const orderId = req.query.order_id;

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

  const imagesQuery = `
    SELECT i.species_id, i.image_url, i.description as image_description
    FROM images i
  `;

  const colorsQuery = `
    SELECT sc.species_id, c.color_name, c.color_code
    FROM species_colors sc
    LEFT JOIN colors c ON sc.color_id = c.color_id
  `;

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

        res.json(speciesWithImagesAndColors);
      });
    });
  });
});




// API để lấy thông tin chi tiết của một species
router.get('/species/:id', (req, res) => {
  const query = `
  SELECT * FROM species 
  WHERE species_id = ?
  `;
  connection.query(query, [req.params.id], (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: err });
      return;
    }
    res.json(results[0]);
  });
});


router.put('/species/:id', (req, res) => {
  const {
    all_province,
    provinces,
    colors,
    vietnamese_name,
    english_name,
    latin_name,
    family_id,
    status,
    description,
    identification,
    habitat,
    color,
    reproduction,
    protection,
    red_list_info,
    food,
    toxin_id,
    serum,
    serum_available,
    other_name,
    distribution,
    value,
    symptoms,
    reference,
    published,
  } = req.body;

  const speciesId = req.params.id;

  // Cập nhật thông tin species
  const updateQuery = `
    UPDATE species SET 
    vietnamese_name = ?, 
    english_name = ?, 
    latin_name = ?, 
    family_id = ?, 
    status = ?, 
    description = ?, 
    identification = ?, 
    habitat = ?, 
    color = ?, 
    reproduction = ?, 
    red_list_info = ?, 
    food = ?, 
    toxin_id = ?, 
    serum = ?, 
    serum_available = ?, 
    other_name = ?, 
    distribution = ?, 
    value = ?, 
    symptoms = ?, 
    protection = ? ,
    reference=?,
    published=?
    WHERE species_id = ?`;

  connection.query(
    updateQuery,
    [
      vietnamese_name,
      english_name,
      latin_name,
      family_id,
      status,
      description,
      identification,
      habitat,
      color,
      reproduction,
      red_list_info,
      food,
      toxin_id,
      serum,
      serum_available,
      other_name,
      distribution,
      value,
      symptoms,
      protection,
      reference,
      published,
      speciesId,
    ],
    (err, results) => {
      if (err) {
        console.error('Database query error:', err);
        return res.status(500).json({ error: err.message });
      }

      // Xử lý các tỉnh
      const handleProvinces = new Promise((resolve, reject) => {
        if (all_province) {
          const getAllProvincesQuery = 'SELECT province_id FROM provinces';
          connection.query(getAllProvincesQuery, (err, allProvinces) => {
            if (err) {
              console.error('Database query error:', err);
              return reject(err);
            }

            const allProvinceIds = allProvinces.map(province => province.province_id);

            // Chèn tất cả các tỉnh vào bảng species_provinces
            const insertProvincesPromises = allProvinceIds.map(provinceId => {
              return new Promise((resolve, reject) => {
                const insertQuery = 'INSERT INTO species_provinces (species_id, province_id) VALUES (?, ?)';
                connection.query(insertQuery, [speciesId, provinceId], (err, results) => {
                  if (err) {
                    console.error('Database query error:', err);
                    return reject(err);
                  }
                  resolve();
                });
              });
            });

            Promise.all(insertProvincesPromises)
              .then(() => resolve())
              .catch(reject);
          });
        } else {
          // Xử lý các tỉnh được truyền vào
          const existingProvincesQuery = 'SELECT province_id FROM species_provinces WHERE species_id = ?';
          connection.query(existingProvincesQuery, [speciesId], (err, existingProvinces) => {
            if (err) {
              console.error('Database query error:', err);
              return reject(err);
            }

            const provincesToDelete = existingProvinces
              .map(province => province.province_id)
              .filter(provinceId => !provinces.includes(provinceId));

            const deletePromises = provincesToDelete.map(provinceId => {
              return new Promise((resolve, reject) => {
                const deleteQuery = 'DELETE FROM species_provinces WHERE species_id = ? AND province_id = ?';
                connection.query(deleteQuery, [speciesId, provinceId], (err, results) => {
                  if (err) {
                    console.error('Database query error:', err);
                    return reject(err);
                  }
                  resolve();
                });
              });
            });

            const provincesPromises = provinces.map(province_id => {
              return new Promise((resolve, reject) => {
                const checkQueryPv = 'SELECT * FROM species_provinces WHERE species_id = ? AND province_id = ?';
                connection.query(checkQueryPv, [speciesId, province_id], (err, results) => {
                  if (err) {
                    console.error('Database query error:', err);
                    return reject(err);
                  }

                  if (results.length > 0) {
                    return resolve();
                  }

                  const insertQueryPv = 'INSERT INTO species_provinces (species_id, province_id) VALUES (?, ?)';
                  connection.query(insertQueryPv, [speciesId, province_id], (err, results) => {
                    if (err) {
                      console.error('Database query error:', err);
                      return reject(err);
                    }
                    resolve();
                  });
                });
              });
            });

            Promise.all([...deletePromises, ...provincesPromises])
              .then(() => resolve())
              .catch(reject);
          });
        }
      });

      // Xử lý các màu sắc
      const handleColors = new Promise((resolve, reject) => {
        // Bước 1: Lấy tất cả các color_id hiện tại từ bảng species_colors
        const getCurrentColorsQuery = 'SELECT color_id FROM species_colors WHERE species_id = ?';
        connection.query(getCurrentColorsQuery, [speciesId], (err, currentColors) => {
          if (err) {
            console.error('Database query error:', err);
            return reject(err);
          }

          const currentColorIds = currentColors.map(color => color.color_id);

          // Bước 2: Tìm các màu cần xóa (có trong currentColorIds nhưng không có trong colors)
          const colorsToDelete = currentColorIds.filter(colorId => !colors.includes(colorId));

          // Bước 3: Tìm các màu cần thêm mới (có trong colors nhưng không có trong currentColorIds)
          const colorsToAdd = colors.filter(colorId => !currentColorIds.includes(colorId));

          // Xóa các màu cần xóa
          const deletePromises = colorsToDelete.map(colorId => {
            return new Promise((resolve, reject) => {
              const deleteQuery = 'DELETE FROM species_colors WHERE species_id = ? AND color_id = ?';
              connection.query(deleteQuery, [speciesId, colorId], (err, results) => {
                if (err) {
                  console.error('Database query error:', err);
                  return reject(err);
                }
                resolve();
              });
            });
          });

          // Thêm các màu cần thêm mới
          const addPromises = colorsToAdd.map(colorId => {
            return new Promise((resolve, reject) => {
              const insertQuery = 'INSERT INTO species_colors (species_id, color_id) VALUES (?, ?)';
              connection.query(insertQuery, [speciesId, colorId], (err, results) => {
                if (err) {
                  console.error('Database query error:', err);
                  return reject(err);
                }
                resolve();
              });
            });
          });

          // Thực hiện cả hai thao tác xoá và thêm
          Promise.all([...deletePromises, ...addPromises])
            .then(() => resolve())
            .catch(reject);
        });
      });

      // Chạy cả hai promises song song
      Promise.all([handleProvinces, handleColors])
        .then(() => {
          res.json({ message: 'Species updated successfully' });
        })
        .catch(err => {
          res.status(500).json({ error: err.message });
        });
    }
  );
});

router.post('/species', (req, res) => {
  const {
    all_province,
    provinces,
    colors,
    vietnamese_name,
    english_name,
    latin_name,
    family_id,
    status,
    description,
    identification,
    habitat,
    color,
    reproduction,
    protection,
    red_list_info,
    food,
    toxin_id,
    serum,
    serum_available,
    other_name,
    distribution,
    value,
    symptoms,
    reference,
    published,
    images,
  } = req.body;

  // Insert new species into the species table
  const insertQuery = `
    INSERT INTO species (
      vietnamese_name, 
      english_name, 
      latin_name, 
      family_id, 
      status, 
      description, 
      identification, 
      habitat, 
      color, 
      reproduction, 
      red_list_info, 
      food, 
      toxin_id, 
      serum, 
      serum_available, 
      other_name, 
      distribution, 
      value, 
      symptoms,
      protection, 
      reference, 
      published
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  connection.query(
    insertQuery,
    [
      vietnamese_name,
      english_name,
      latin_name,
      family_id,
      status,
      description,
      identification,
      habitat,
      color,
      reproduction,
      red_list_info,
      food,
      toxin_id,
      serum,
      serum_available,
      other_name,
      distribution,
      value,
      symptoms,
      protection,
      reference,
      published,
    ],
    (err, results) => {
      if (err) {
        console.error('Database query error:', err);
        return res.status(500).json({ error: err.message });
      }

      const speciesId = results.insertId;

      // Handle provinces if provided
      const handleProvinces = new Promise((resolve, reject) => {
        if (all_province) {
          const getAllProvincesQuery = 'SELECT province_id FROM provinces';
          connection.query(getAllProvincesQuery, (err, allProvinces) => {
            if (err) {
              console.error('Database query error:', err);
              return reject(err);
            }

            const allProvinceIds = allProvinces.map(province => province.province_id);

            const insertProvincesPromises = allProvinceIds.map(provinceId => {
              return new Promise((resolve, reject) => {
                const insertQuery = 'INSERT INTO species_provinces (species_id, province_id) VALUES (?, ?)';
                connection.query(insertQuery, [speciesId, provinceId], (err, results) => {
                  if (err) {
                    console.error('Database query error:', err);
                    return reject(err);
                  }
                  resolve();
                });
              });
            });

            Promise.all(insertProvincesPromises)
              .then(() => resolve())
              .catch(reject);
          });
        } else {

          if (!provinces) {
            return resolve();
          }

          const insertProvincesPromises = provinces.map(provinceId => {
            return new Promise((resolve, reject) => {
              const insertQuery = 'INSERT INTO species_provinces (species_id, province_id) VALUES (?, ?)';
              connection.query(insertQuery, [speciesId, provinceId], (err, results) => {
                if (err) {
                  console.error('Database query error:', err);
                  return reject(err);
                }
                resolve();
              });
            });
          });

          Promise.all(insertProvincesPromises)
            .then(() => resolve())
            .catch(reject);
        }
      });

      // Handle colors if provided
      const handleColors = new Promise((resolve, reject) => {
        if (!colors) {
          return resolve();
        }
        const insertColorsPromises = colors.map(colorId => {
          return new Promise((resolve, reject) => {
            const insertQuery = 'INSERT INTO species_colors (species_id, color_id) VALUES (?, ?)';
            connection.query(insertQuery, [speciesId, colorId], (err, results) => {
              if (err) {
                console.error('Database query error:', err);
                return reject(err);
              }
              resolve();
            });
          });
        });

        Promise.all(insertColorsPromises)
          .then(() => resolve())
          .catch(reject);
      });

      // Handle colors if provided
      const handleImages = new Promise((resolve, reject) => {
        if (!images) {
          return resolve();
        }
        const insertImagesPromises = images.map(image => {
          return new Promise((resolve, reject) => {
            const insertQuery = 'INSERT INTO images (species_id, image_url,description) VALUES (?, ?,?)';
            connection.query(insertQuery, [speciesId, image.link, image.description], (err, results) => {
              if (err) {
                console.error('Database query error:', err);
                return reject(err);
              }
              resolve();
            });
          });
        });

        Promise.all(insertImagesPromises)
          .then(() => resolve())
          .catch(reject);
      });

      // Execute province and color insertion concurrently
      Promise.all([handleProvinces, handleColors, handleImages])
        .then(() => {
          res.json({ message: 'Species inserted successfully', species_id: speciesId });
        })
        .catch(err => {
          res.status(500).json({ error: err.message });
        });
    }
  );
});









// API để lấy danh sách images của một species
router.get('/species/:id/images', (req, res) => {
  const query = 'SELECT * FROM images WHERE species_id = ?';
  connection.query(query, [req.params.id], (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: err });
      return;
    }
    res.json(results);
  });
});

// API để thêm image vào một species
router.post('/species/:id/images', (req, res) => {
  const images = req.body;
  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'Invalid input data' });
  }
  // Tạo mảng các truy vấn để thực thi đồng thời
  const queries = images.map(image => {
    return new Promise((resolve, reject) => {
      const query = 'INSERT INTO images (species_id, image_url, description) VALUES (?, ?, ?)';
      connection.query(query, [req.params.id, image.link, image.description], (err, results) => {
        if (err) {
          console.error('Database query error:', err);
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
  });

  // Thực thi tất cả các truy vấn và gửi phản hồi khi tất cả hoàn tất
  Promise.all(queries)
    .then(() => res.json({ message: 'Images added successfully' }))
    .catch(err => res.status(500).json({ error: err.message }));
});

router.delete('/images/:imageId', (req, res) => {
  const imageId = req.params.imageId;

  const query = 'DELETE FROM images WHERE id = ?';

  connection.query(query, [imageId], (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.json({ message: 'Image deleted successfully' });
  });
});

// API để lấy danh sách colors của một species
router.get('/species/:id/colors', (req, res) => {
  const query = 'SELECT * FROM species_colors WHERE species_id = ?';
  connection.query(query, [req.params.id], (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: err });
      return;
    }
    res.json(results);
  });
});

router.get('/species/:id/provinces', (req, res) => {
  const query = 'SELECT * FROM species_provinces WHERE species_id = ?';
  connection.query(query, [req.params.id], (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: err });
      return;
    }
    res.json(results);
  });
});





// API để xóa image của một species
router.delete('/images/:id', (req, res) => {
  const query = 'DELETE FROM images WHERE image_id = ?';
  connection.query(query, [req.params.id], (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: err });
      return;
    }
    res.json({ message: 'Image deleted successfully' });
  });
});


router.get('/toxins', (req, res) => {
  const query = 'SELECT * FROM toxins';
  connection.query(query, (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: err });
      return;
    }
    res.json(results);
  });
});

router.get('/colors', (req, res) => {
  const query = 'SELECT * FROM colors';
  connection.query(query, (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: err });
      return;
    }
    res.json(results);
  });
});

router.get('/provinces', (req, res) => {
  const query = 'SELECT * FROM provinces';
  connection.query(query, (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: err });
      return;
    }
    res.json(results);
  });
});

router.get('/get-province-by-location', async (req, res) => {
  let lat = req.query.lat;
  let lng = req.query.lng;
  let response = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`)

  if (response.data) {
    res.json(response.data);
  }

});
router.get('/get-boundary', async (req, res) => {
  let city_name = req.query.city;
  let response = await axios.get(`https://nominatim.openstreetmap.org/search?city=${city_name}&format=json&polygon_geojson=1`)

  if (response.data) {
    res.json(response.data);
  }

});

// API lấy danh sách bài post
router.get('/posts', (req, res) => {
  const sql = 'SELECT * FROM posts';
  connection.query(sql, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});

// API thêm mới bài post
router.post('/posts', (req, res) => {
  const { title, content, thumbnail_url } = req.body;
  const sql = 'INSERT INTO posts (title, content, thumbnail_url) VALUES (?, ?, ?)';
  connection.query(sql, [title, content, thumbnail_url], (err, result) => {
    if (err) throw err;
    res.send({ success: true });
  });
});

// API chỉnh sửa bài post
router.put('/posts/:id', (req, res) => {
  const { title, content, thumbnail_url } = req.body;
  const { id } = req.params;
  const sql = 'UPDATE posts SET title = ?, content = ?, thumbnail_url = ? WHERE post_id = ?';
  connection.query(sql, [title, content, thumbnail_url, id], (err, result) => {
    if (err) throw err;
    res.send({ success: true });
  });
});

router.get('/get-inaruralist-token', async (req, res) => {
  const query = 'SELECT * FROM setup';
  connection.query(query, (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: err });
      return;
    }
    res.json(results);
  });
});


// API để tạo feedback
router.post('/feedbacks', (req, res) => {
  const { device_id, species_id, feedback_content } = req.body;

  if (!device_id || !feedback_content) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const querySpec = 'INSERT INTO feedbacks (device_id, species_id, feedback_content) VALUES (?, ?, ?)';
  const queryNoSpec = 'INSERT INTO feedbacks (device_id, feedback_content) VALUES (?, ?)';

  if (species_id) {
    connection.query(querySpec, [device_id, species_id, feedback_content], (err, results) => {
      if (err) {
        console.error('Database query error:', err);
        res.status(500).json({ error: err });
        return;
      }
      res.status(201).json({ message: 'Feedback created successfully', feedbackId: results.insertId });
    });
  } else {
    connection.query(queryNoSpec, [device_id, feedback_content], (err, results) => {
      if (err) {
        console.error('Database query error:', err);
        res.status(500).json({ error: err });
        return;
      }
      res.status(201).json({ message: 'Feedback created successfully', feedbackId: results.insertId });
    });
  }


});

module.exports = router;
