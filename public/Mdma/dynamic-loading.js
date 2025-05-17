// This function would replace the mock file system
// and load files dynamically from your directory
function loadFileContent(filename) {
  return fetch(filename)
    .then(response => {
      if (!response.ok) {
        throw new Error(`File not found: ${filename}`);
      }
      return response.text();
    });
}

// This function would scan the directory for .mdma files
function loadFileList() {
  // In a real implementation, this would be a server endpoint
  // that returns a list of files in the directory
  return fetch('list-files.php')  // This would be your server endpoint
    .then(response => response.json())
    .then(files => {
      const directoryEl = document.getElementById('directory');
      directoryEl.innerHTML = '';
      
      files.forEach(file => {
        if (file.endsWith('.mdma')) {
          const fileEl = document.createElement('div');
          fileEl.className = 'file';
          fileEl.dataset.file = file;
          fileEl.innerHTML = `
            <span class="file-icon markdown-icon">📄</span>
            <span>${file}</span>
          `;
          
          fileEl.addEventListener('click', () => {
            loadFile(file);
          });
          
          directoryEl.appendChild(fileEl);
        }
      });
    });
}

// Updated loadFile function to work with real files
function loadFile(filename) {
  // Set loading state
  preview.innerHTML = '<p>Loading...</p>';
  currentFileElement.textContent = `Loading: ${filename}`;
  
  // Get file content from the actual file system
  loadFileContent(filename)
    .then(markdownContent => {
      // Update current file display
      currentFileElement.textContent = `Current file: ${filename}`;
      
      // Parse markdown to HTML
      const html = parser.parse(markdownContent);
      
      // Update preview
      preview.innerHTML = html;
      
      // Update active file highlight
      document.querySelectorAll('.file').forEach(el => {
        if (el.dataset.file === filename) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      });
    })
    .catch(error => {
      preview.innerHTML = `<p>Error: ${error.message}</p>`;
    });
}

// Load the file list when the page loads
document.addEventListener('DOMContentLoaded', () => {
  loadFileList();
  
  // Refresh file list button
  document.getElementById('refresh-btn').addEventListener('click', loadFileList);
});