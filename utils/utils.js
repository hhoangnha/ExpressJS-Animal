// utils.js
function checkToxin(toxin) {
  try {
    if (
      toxin.toLowerCase().includes('hemotoxin') ||
      toxin.toLowerCase().includes('neurotoxin') ||
      toxin.toLowerCase().includes('cytotoxin')
    ) {
      return 'Rắn độc';
    } else if (toxin === 'Bán độc') {
      return 'Bán độc';
    } else {
      return 'Vô hại';
    }
  } catch (error) {
    return 'Chưa xác định';
  }
}
const stripHtmlAndEscape = (html) => {
  try {
    // Loại bỏ tất cả các thẻ HTML
    let text = html.replace(/<[^>]*>/g, '');

    // Escape các ký tự đặc biệt
    text = text.replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');

    return text;
  } catch (error) {
    return html
  }
};

module.exports = { checkToxin, stripHtmlAndEscape };
