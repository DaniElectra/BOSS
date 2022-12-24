const path = require('path');
const fs = require('fs-extra');
const express = require('express');
const subdomain = require('express-subdomain');

// Router to handle the subdomain restriction
const npdl = express.Router();

// Setup routes
npdl.get('/p01/nsa/:titleHash/:folderName/:fileName', (request, response) => {
	const { titleHash, folderName, fileName } = request.params;
	const contentPath = path.normalize(`${__dirname}/../../cdn/content/encrypted/${titleHash}/${folderName}/${fileName}`);

	if (fs.existsSync(contentPath)) {
		const ifModifiedSince = new Date(request.header("If-Modified-Since"));
		const fileModified = fs.statSync(contentPath).mtime;
		// If the file hasn't been modified since the If-Modified-Since date, return 304 Not Modified
		if (ifModifiedSince >= fileModified) {
			response.sendStatus(304);
			return;
		}

		response.set('Content-Type', 'application/octet-stream');
		response.set('Content-Disposition', 'attachment');
		response.set('Content-Transfer-Encoding', 'binary');
		response.sendFile(contentPath);
	} else {
		response.sendStatus(404);
	}
});

// Main router for endpoints
const router = express.Router();

// Create subdomain
router.use(subdomain('npdl.cdn', npdl));

module.exports = router;
