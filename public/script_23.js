window.addEventListener('load', function() {
    const preloader = document.getElementById('preloader');
    setTimeout(() => {
        preloader.classList.add('fade-out');
        setTimeout(() => {
            preloader.style.display = 'none';
        }, 500);
    }, 1500);
});

async function checkStatus() {
    const sessionId = document.getElementById('sessionId').value.trim();
    const statusDiv = document.getElementById('status');
    const downloadArea = document.getElementById('downloadArea');
    
    
    if (!sessionId) {
        statusDiv.innerHTML = `
            <div class="alert alert-destructive">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <div>Please enter a session ID</div>
            </div>
        `;
        return;
    }
    
    statusDiv.innerHTML = `
        <div class="alert alert-processing">
            <div class="spinner"></div>
            <div>Checking status...</div>
        </div>
    `;
    downloadArea.innerHTML = '';
    
    try {
        const url = `/status/${sessionId}`;
        const response = await fetch(url);
        const data = await response.json();
        
        statusDiv.innerHTML = '';
        downloadArea.innerHTML = '';
        
        if (data.status === 'processing') {
            statusDiv.innerHTML = `
                <div class="alert alert-processing">
                    <div class="spinner"></div>
                    <div>Processing your files...</div>
                </div>
            `;
        } else if (data.status === 'ready') {
            statusDiv.innerHTML = `
                <div class="alert alert-success">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20,6 9,17 4,12"/>
                    </svg>
                    <div>Your files are ready for download!</div>
                </div>
            `;
            downloadArea.innerHTML = `
                <div class="text-center mt-4">
                    <a href="/download/${sessionId}" class="button button-success">
                        <svg class="icon" style="margin-right: 0.5rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7,10 12,15 17,10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Download Files
                    </a>
                </div>
            `;
        } else if (data.status === 'downloaded') {
            statusDiv.innerHTML = `
                <div class="alert alert-destructive">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    <div>File has already been downloaded and removed</div>
                </div>
            `;
        } else {
            statusDiv.innerHTML = `
                <div class="alert alert-destructive">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    <div>Session not found or expired</div>
                </div>
            `;
        }
    } catch (error) {
        statusDiv.innerHTML = `
            <div class="alert alert-destructive">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <div>Error checking status</div>
            </div>
        `;
    }
}
        
document.getElementById('sessionId').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        checkStatus();
    }
});