// Global state
let uploadedDocuments = [];
let selectedDepartment = null;
let chatHistory = []; // Stores conversation in Gemini API format {role: "user/model", parts: [{text: "..."}]}
let questionCount = 0;
let builtInResources = {};

const departmentResources = {
    'engineering': {
        'Mathematics': ['Calculus', 'Differential Equations', 'Linear Algebra', 'Statistics'],
        'Physics': ['Mechanics', 'Thermodynamics', 'Electromagnetics', 'Quantum Physics'],
        'Design': ['CAD Tutorials', 'Design Principles', 'Materials Science', 'Manufacturing']
    },
    'computer-science': {
        'Programming': ['Data Structures', 'Algorithms', 'OOP Concepts', 'Design Patterns'],
        'Systems': ['Operating Systems', 'Networks', 'Databases', 'Distributed Systems'],
        'AI/ML': ['Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision']
    },
    'medicine': {
        'Basic Sciences': ['Anatomy', 'Physiology', 'Biochemistry', 'Pathology'],
        'Clinical': ['Internal Medicine', 'Surgery', 'Pediatrics', 'Pharmacology'],
        'Research': ['Clinical Trials', 'Medical Statistics', 'Research Methods', 'Ethics']
    },
    'business': {
        'Core Subjects': ['Accounting', 'Finance', 'Marketing', 'Management'],
        'Analytics': ['Business Intelligence', 'Financial Modeling', 'Market Research', 'Operations Management'],
        'Strategy': ['Strategic Planning', 'Entrepreneurship', 'Global Business', 'Ethics in Business']
    },
    'law': {
        'Foundational': ['Constitutional Law', 'Criminal Law', 'Contract Law', 'Tort Law'],
        'Specialized': ['Corporate Law', 'Environmental Law', 'International Law', 'Family Law'],
        'Practice': ['Legal Research', 'Moot Court', 'Client Counseling', 'Legal Ethics']
    },
    'arts': {
        'Literature': ['Literary Theory', 'Poetry Analysis', 'World Literature', 'Creative Writing'],
        'History': ['Ancient Civilizations', 'Modern History', 'Art History', 'Historiography'],
        'Philosophy': ['Ethics', 'Metaphysics', 'Epistemology', 'Logic']
    },
    'science': {
        'Chemistry': ['Organic Chemistry', 'Inorganic Chemistry', 'Physical Chemistry', 'Analytical Chemistry'],
        'Biology': ['Cell Biology', 'Genetics', 'Ecology', 'Microbiology'],
        'Physics': ['Quantum Mechanics', 'Relativity', 'Astrophysics', 'Condensed Matter Physics']
    },
    'general': {
        'Study Skills': ['Time Management', 'Note-Taking', 'Time-blocking', 'Exam Preparation', 'Critical Thinking'],
        'Research': ['Academic Writing', 'Research Methods', 'Citation Styles', 'Data Analysis'],
        'Well-being': ['Stress Management', 'Mindfulness', 'Healthy Habits', 'Goal Setting']
    }
};

// DOM elements
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const uploadedFilesList = document.getElementById('uploadedFiles');
const libraryFilesList = document.getElementById('libraryFiles');
const docCountSpan = document.getElementById('docCount');
const questionCountSpan = document.getElementById('questionCount');
const uploadStatusDiv = document.getElementById('uploadStatus');
const libraryStatsDiv = document.getElementById('libraryStats');
const chatHistoryDiv = document.getElementById('chatHistory');
const questionInput = document.getElementById('questionInput');
const resourceCategoriesDiv = document.getElementById('resourceCategories');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

// Setup
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    updateDocumentCount();
    updateLibraryStats();
    selectDepartment('general');
    clearChat(false); // Initialize chat history without extra message
    loadSavedItems();
});

// Event listeners
function setupEventListeners() {
    const chooseFilesButton = document.getElementById('chooseFilesBtn');
    const clearAllButton = document.getElementById('clearAllBtn');
    const askAIButton = document.getElementById('askAIButton');
    const summarizeButton = document.getElementById('summarizeButton');
    const clearChatButton = document.getElementById('clearChatButton');

    if (chooseFilesButton) chooseFilesButton.addEventListener('click', () => fileInput.click());
    if (clearAllButton) clearAllButton.addEventListener('click', clearAllFiles);
    if (askAIButton) askAIButton.addEventListener('click', askQuestion);
    if (summarizeButton) summarizeButton.addEventListener('click', generateSummary);
    if (clearChatButton) clearChatButton.addEventListener('click', () => clearChat(true)); // Pass true to show clear message

    document.querySelectorAll('.department-card').forEach(card =>
        card.addEventListener('click', () => selectDepartment(card.dataset.dept)));

    uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
    uploadZone.addEventListener('dragleave', e => { e.preventDefault(); uploadZone.classList.remove('drag-over'); });
    uploadZone.addEventListener('drop', e => { e.preventDefault(); uploadZone.classList.remove('drag-over'); processFiles(e.dataTransfer.files); });
    fileInput.addEventListener('change', e => processFiles(e.target.files));
    questionInput.addEventListener('keypress', e => { if (e.key === 'Enter') askQuestion(); });
}

/**
 * Reads a File object as a Data URL (Base64 encoded string).
 * @param {File} file - The File object to read.
 * @returns {Promise<string>} A promise that resolves with the Data URL.
 */
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            resolve(reader.result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// File handling
async function processFiles(files) {
    if (!files.length) return;

    progressBar.style.display = 'block';
    progressFill.style.width = '0%';
    uploadStatusDiv.textContent = 'Uploading and processing...';

    let filesProcessed = 0;

    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const fileName = file.name;

        let simulatedProgress = 0;
        const interval = setInterval(() => {
            simulatedProgress += 5;
            if (simulatedProgress <= 100) progressFill.style.width = `${(filesProcessed / files.length * 100) + (simulatedProgress / files.length)}%`;
            else clearInterval(interval);
        }, 50);

        try {
            const res = await fetch('http://127.0.0.1:5000/upload', { method: 'POST', body: formData });
            clearInterval(interval);
            filesProcessed++;
            progressFill.style.width = `${(filesProcessed / files.length) * 100}%`;

            const data = await res.json();

            if (data.success) {
                const doc = {
                    id: Date.now() + Math.random(),
                    name: fileName,
                    type: file.type, // Use file.type for MIME type (e.g., 'application/pdf', 'image/jpeg')
                    content: data.extractedText || '', // Extracted text for PDFs
                    imageData: '' // Placeholder for image data (Base64)
                };

                // If it's an image, read its data for potential AI multimodal input
                if (file.type.includes('image')) {
                    doc.imageData = await readFileAsDataURL(file);
                }

                uploadedDocuments.push(doc);
                displayUploadedFile(doc);
                updateDocumentCount();
                addChatMessage(`✅ Uploaded: ${fileName} (${data.message})`, 'ai');
            } else {
                addChatMessage(`❌ Error uploading ${fileName}: ${data.message}`, 'ai');
            }
        } catch (err) {
            clearInterval(interval);
            filesProcessed++;
            progressFill.style.width = `${(filesProcessed / files.length) * 100}%`;
            console.error(`Upload failed for ${fileName}:`, err);
            addChatMessage(`❌ Upload failed for ${fileName}. Network or server error.`, 'ai');
        } finally {
            if (filesProcessed === files.length) {
                setTimeout(() => {
                    progressBar.style.display = 'none';
                    uploadStatusDiv.textContent = '';
                }, 500);
            }
        }
    }
}

function displayUploadedFile(file) {
    const item = document.createElement('div');
    item.className = 'file-item';
    const fileIcon = file.type.includes('pdf') ? '📄' : (file.type.includes('image') ? '🖼️' : '📁');
    item.innerHTML = `<span>${fileIcon} ${file.name}</span><button class="remove-file-btn" data-id="${file.id}">Remove</button>`;
    
    uploadedFilesList.appendChild(item);
    
    const libItem = item.cloneNode(true);
    libraryFilesList.appendChild(libItem);

    [item, libItem].forEach(el => {
        const removeButton = el.querySelector('.remove-file-btn');
        if (removeButton) {
            removeButton.addEventListener('click', e =>
                removeFile(parseFloat(e.target.dataset.id))
            );
        }
    });

    updateLibraryStats();
}

function removeFile(id) {
    uploadedDocuments = uploadedDocuments.filter(doc => doc.id !== id);
    document.querySelectorAll(`.remove-file-btn[data-id="${id}"]`).forEach(btn =>
        btn.closest('.file-item')?.remove()
    );
    updateDocumentCount();
    updateLibraryStats();
    addChatMessage('🗑️ File removed.', 'ai');
}

function clearAllFiles() {
    uploadedDocuments = [];
    uploadedFilesList.innerHTML = '';
    libraryFilesList.innerHTML = '';
    updateDocumentCount();
    updateLibraryStats();
    addChatMessage('📂 All files cleared.', 'ai');
}

// Stats & UI
function updateDocumentCount() {
    docCountSpan.textContent = uploadedDocuments.length;
}

function updateLibraryStats() {
    libraryStatsDiv.style.display = uploadedDocuments.length === 0 ? 'block' : 'none';
}

function selectDepartment(dept) {
    selectedDepartment = dept;
    document.querySelectorAll('.department-card').forEach(card =>
        card.classList.toggle('selected', card.dataset.dept === dept)
    );
    addChatMessage(`🎓 Department set to ${dept.replace('-', ' ').toUpperCase()}`, 'ai');
    displayBuiltInResources(dept);
}

async function displayBuiltInResources(dept) {
    const categories = departmentResources[dept];
    if (!categories) {
        resourceCategoriesDiv.innerHTML = 'No resources available.';
        return;
    }

    let html = '';
    for (const category in categories) {
        html += `<h4>${category}</h4><ul class="resource-list">`;
        for (const topic of categories[category]) {
            const key = `${dept}-${category}-${topic}`;
            if (!builtInResources[key]) {
                builtInResources[key] = await simulateResourceLoad(dept, category, topic);
            }
            html += `<li><span class="resource-item" data-topic="${topic}" data-category="${category}" data-dept="${dept}">${topic}</span></li>`;
        }
        html += '</ul>';
    }
    resourceCategoriesDiv.innerHTML = html;

    document.querySelectorAll('.resource-item').forEach(item => {
        item.addEventListener('click', () => {
            const { topic, category, dept } = item.dataset;
            const key = `${dept}-${category}-${topic}`;
            addChatMessage(`📘 <strong>${topic}:</strong><br>${builtInResources[key].slice(0, 200)}...`, 'ai');
        });
    });
}

function simulateResourceLoad(dept, cat, topic) {
    return new Promise(res => {
        setTimeout(() => {
            res(`This is a simulated resource on ${topic} in ${cat} (${dept}) with detailed explanations and examples. This is placeholder content to demonstrate resource loading.`);
        }, 300);
    });
}

// Chat & QnA
function addChatMessage(message, sender) {
    const div = document.createElement('div');
    div.className = `${sender}-message`;
    div.innerHTML = `
        <div class="message-header">
            <span>${sender === 'ai' ? '🤖' : '👤'}</span><span>${sender === 'ai' ? 'AI Assistant' : 'You'}</span>
        </div>
        <div class="message-content"><p>${message}</p></div>
    `;
    chatHistoryDiv.appendChild(div);
    chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;

    if (sender === 'user' || sender === 'ai') {
        const plainTextMessage = div.querySelector('.message-content p').innerText;
        // Store chat history in the format expected by the Gemini API
        chatHistory.push({ role: sender === 'user' ? 'user' : 'model', parts: [{ text: plainTextMessage }] });
    }
}

async function askQuestion() {
    const question = questionInput.value.trim();
    if (!question && uploadedDocuments.filter(doc => doc.imageData).length === 0) {
        return addChatMessage('⚠️ Enter a question or upload an image first.', 'ai');
    }
    
    // Add user's question to chat history
    addChatMessage(question, 'user'); 
    questionInput.value = '';
    questionCount++;
    questionCountSpan.textContent = questionCount;
    addChatMessage('💭 Generating...', 'ai');

    try {
        // Collect text content from PDFs
        const textDocuments = uploadedDocuments
            .filter(doc => doc.content && doc.content.length > 0)
            .map(doc => doc.content);

        // Collect Base64 image data from uploaded images
        const imageDatas = uploadedDocuments
            .filter(doc => doc.imageData && doc.imageData.length > 0)
            .map(doc => doc.imageData);

        const res = await fetch('http://127.0.0.1:5000/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question,
                documents: textDocuments, // Text content for context
                images: imageDatas,     // Image data (Base64) for multimodal AI
                department: selectedDepartment,
                chatHistory: chatHistory // Send the full chat history
            })
        });
        const data = await res.json();
        if (chatHistoryDiv.lastChild && chatHistoryDiv.lastChild.textContent.includes('💭 Generating')) {
             chatHistoryDiv.lastChild.remove();
        }
        addChatMessage(data.answer, 'ai');
    } catch (err) {
        console.error("Error asking question:", err);
        if (chatHistoryDiv.lastChild && chatHistoryDiv.lastChild.textContent.includes('💭 Generating')) {
            chatHistoryDiv.lastChild.remove();
        }
        addChatMessage('❌ AI failed to respond. Please try again.', 'ai');
    }
}

async function generateSummary() {
    // Summarization is typically text-based. If you want to summarize images (e.g., visual content),
    // you'd need a multimodal model and different prompting strategies.
    // For now, this only summarizes text content from PDFs.
    const textDocuments = uploadedDocuments
        .filter(doc => doc.content && doc.content.length > 0)
        .map(doc => doc.content);

    if (!textDocuments.length) return addChatMessage('⚠️ Upload text-based documents (e.g., PDFs) to summarize.', 'ai');
    addChatMessage('📄 Summarizing...', 'ai');

    try {
        const res = await fetch('http://127.0.0.1:5000/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                documents: textDocuments, // Only send text content to the AI
                department: selectedDepartment
            })
        });
        const data = await res.json();
        if (chatHistoryDiv.lastChild && chatHistoryDiv.lastChild.textContent.includes('📄 Summarizing')) {
             chatHistoryDiv.lastChild.remove();
        }
        addChatMessage(`<strong>Summary:</strong><br>${data.summary}`, 'ai');
    } catch (err) {
        console.error("Error generating summary:", err);
        if (chatHistoryDiv.lastChild && chatHistoryDiv.lastChild.textContent.includes('📄 Summarizing')) {
            chatHistoryDiv.lastChild.remove();
        }
        addChatMessage('❌ Failed to summarize. Please check server logs.', 'ai');
    }
}

function clearChat(showMessage = true) {
    chatHistory = [];
    questionCount = 0;
    questionCountSpan.textContent = questionCount;
    chatHistoryDiv.innerHTML = `
        <div class="ai-message welcome-message">
            <div class="message-header">
                <span>🤖</span>
                <span>AI Assistant</span>
            </div>
            <div class="message-content">
                <p>👋 Welcome to UniStudy AI! I'm your department-agnostic study assistant.</p>
                <p><strong>Here's how I can help you:</strong></p>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>📖 Answer questions from your uploaded materials</li>
                    <li>📝 Create summaries and study guides</li>
                    <li>🔍 Find specific information across multiple documents</li>
                    <li>💡 Explain complex concepts in simple terms</li>
                    <li>📊 Analyze patterns in your study materials</li>
                </ul>
                <p>Select your department above and upload your study materials to get started!</p>
            </div>
        </div>
    `;
    if (showMessage) {
        addChatMessage('🧹 Chat history cleared.', 'ai');
    }
}

function handleSaveChat(question, answer) {
    const savedItems = JSON.parse(localStorage.getItem('savedUniStudyItems') || '[]');
    savedItems.push({ id: Date.now(), question, answer, timestamp: new Date().toISOString() });
    localStorage.setItem('savedUniStudyItems', JSON.stringify(savedItems));
    addChatMessage('⭐️ Chat saved!', 'ai');
    loadSavedItems();
}

function deleteSavedItem(id) {
    let savedItems = JSON.parse(localStorage.getItem('savedUniStudyItems') || '[]');
    savedItems = savedItems.filter(item => item.id !== parseFloat(id));
    localStorage.setItem('savedUniStudyItems', JSON.stringify(savedItems));
    addChatMessage('🗑️ Saved item deleted.', 'ai');
    loadSavedItems();
}

function loadSavedItems() {
    const savedItems = JSON.parse(localStorage.getItem('savedUniStudyItems') || '[]');
    const qaSection = document.querySelector('.qa-section');
    let section = document.querySelector('.saved-items-section');

    if (savedItems.length === 0) {
        section?.remove();
        return;
    }

    if (!section) {
        section = document.createElement('div');
        section.className = 'card saved-items-section';
        section.innerHTML = `<h4>⭐️ Saved Questions & Notes</h4><ul class="saved-list" id="savedQuestionsList"></ul>`;
        qaSection.appendChild(section);
    }

    const list = section.querySelector('#savedQuestionsList');
    list.innerHTML = '';
    savedItems.forEach(item => {
        const li = document.createElement('li');
        li.className = 'saved-item';
        const timestamp = new Date(item.timestamp).toLocaleString();
        li.innerHTML = `
            <div class="saved-question">Q: ${item.question}</div>
            <div class="saved-answer">A: ${item.answer}</div>
            <div class="saved-meta">${timestamp}</div>
            <div class="saved-actions">
                <button class="delete-saved-btn" data-id="${item.id}">Delete</button>
            </div>
        `;
        list.appendChild(li);
    });

    list.querySelectorAll('.delete-saved-btn').forEach(btn =>
        btn.addEventListener('click', e =>
            deleteSavedItem(e.target.dataset.id)
        )
    );
}