function truncateText(value, maxLength) {
	const text = String(value);
	return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

module.exports = { truncateText };