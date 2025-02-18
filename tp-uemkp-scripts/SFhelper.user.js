// ==UserScript==
// @name         SFhelper
// @namespace    http://tampermonkey.net/
// @version      2.9.9.4
// @description  Designed to assist mods (T1 & T2) in the workflow and shift reports.
// @author       Oscar O.
// @match        https://epicgames.lightning.force.com/lightning/*
// @match        https://my.tanda.co/staff*
// @match        https://horde.devtools.epicgames.com/stream/ue5-marketplace?tab=General
// @grant        GM_xmlhttpRequest
// @connect      fab-admin.daec.live.use1a.on.epicgames.com
// @downloadURL  https://raw.githubusercontent.com/212oscar/sforward/main/tp-uemkp-scripts/SFhelper.user.js
// @updateURL    https://raw.githubusercontent.com/212oscar/sforward/main/tp-uemkp-scripts/SFhelper.user.js
// @history      2.9.9.4 Fixed the getEarliestUEVersion function to avoid getting the wrong earliest version (example, now it will recognize that 4.2 is minor than 4.10)
// @history      2.9.9.3 Added the new 2025 shift report form link
// @history      2.9.9.2 Improved the Copy notifications when the SF case, App names or P4V info is copied 
// @history      2.9.9 Improved the App names displaying style and added a warning when seller is BLUE or SBP
// @history      2.9.8 Fixed a bug where template IDs were not being stored correctly after using the edit button, now the URL will be stored instead of the extracted ID.
// @history      2.9.7.2 Updated the Binary string for 5.2 version when hording plugins (5.2.0-25360045+++UE5+Release-5.2) was updated again in the confluence
// @history      2.9.7.1 Updated the Binary string for 5.2 versions when hording plugins (5.2.1-26001984+++UE5+Release-5.2) was updated yesterday 12/05/2024
// @history      2.9.7 Added user side validation (countdown) before creating the job automatically in Horde, also added internal validation to avoid creating jobs with empty fields, updated Documentation (more user friendly)
// @history      2.9.6 New download/update link for easier installation the first time.
// @history      2.9.5 Fixed some bugs where the Horde button was not creating jobs due to horde being slow, still can fail but now is less probably!
// @history      2.9.4 Fixed a bug where when working with multiples SF tabs, changing the case status will change the status of another tab and not the visible one (Thanks to Christian E. for reporting this issue), Added a confirmation message when clicking the "Decline" button.
// @history      2.9.3 Added midnight PST shift splitter, separated shift if is cross-midnight PST send shift report for each part of the split shift and reminder to send the shift report, some visual improvements.
// @history      2.9.1 Added a Close button to change the case status. Improved the Shift Report, now Support case types are allowed, now you only need to paste the URL of the Google Sheets or Google Drive Folder. Deleted some unused code .
// @history      2.8.4 Now you can create TRCs on your name! (previously my name was there as the creator) Just login with google the first time and that's it.
// @history      2.8.3 Fixed an issue where a Please wait windows randomly appeared in Salesforce, the Fab Preview now also is showing for unity submissions.
// @history      2.8.2 Added the Fab Preview Link!!!, now you can get the FAB preview in the Get info button.
// @history      2.8.0 Autohorde when clicking the horde button! before I used another script for this but I integrated it here, so let me know of any issues.
// @history      2.7.0 New easier way to add/update your shifts!
// @history      2.6.2 Fixed a bug where the Copy cases button was not using the proper case type.
// @history      2.6 Added the version number to the collapsible button and refactored the checkPageLoading function to reuse existing function
// @history      2.5 Added button reset all settings and fixed the Edit button (for the TRC templates) not showing up
// ==/UserScript==

(function () {
    'use strict';

    const SALESFORCE_URL = 'https://epicgames.lightning.force.com';
    const TANDA_URL = 'https://my.tanda.co/staff';

    // Function to show a modal when adding Shifts from tanda page
    function showTandaModal() {
        const modal = document.createElement('div');
        modal.id = 'custom-modal';
        modal.className = 'keep-overlay';  // class to avoid closing the dark overlay when clicking any button in the script
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            max-width: 400px;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border: 1px solid #ccc;
            border-radius: 5px;
            z-index: 10000;
        `;

        const messageDiv = document.createElement('div');
        messageDiv.innerText = 'The Tanda page will be opened so we can retrieve your current shifts. You need to be logged in already with Modsquad OKTA, before clicking "ok" please go to OKTA and enter in Workforce page to ensure you are logged in, If you are ready, click OK.';
        modal.appendChild(messageDiv);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
        `;

        const okButton = document.createElement('button');
        okButton.innerText = 'OK';
        okButton.style.cssText = `
            padding: 10px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        `;
        okButton.addEventListener('click', () => {
            window.open(TANDA_URL, '_blank');
            modal.remove();
        });
        buttonContainer.appendChild(okButton);

        const cancelButton = document.createElement('button');
        cancelButton.innerText = 'Cancel';
        cancelButton.style.cssText = `
            padding: 10px;
            background: #f44336;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        `;
        cancelButton.addEventListener('click', () => {
            modal.remove();
        });
        buttonContainer.appendChild(cancelButton);

        modal.appendChild(buttonContainer);
        document.body.appendChild(modal);
    }

    // Listen for shift data from Tanda
    window.addEventListener('message', (event) => {
        if (event.origin !== 'https://my.tanda.co') return;

        const { type, data } = event.data;
        if (type === 'SHIFT_DATA') {
            console.log('Received shift data from Tanda:', data);
            const parsedEvents = parseEvents(data);
            localStorage.setItem('parsedTandaScheduleData', JSON.stringify(parsedEvents));
            alert('Shift data received and stored successfully.');
            location.reload(); // Reload the page to apply changes
            
        }
    });

   // Listen for messages from other tabs
    window.addEventListener('message', (event) => {
        if (event.origin !== 'https://epicgames.lightning.force.com') return;

        const { type, data, customProperty } = event.data;

        // Check for the custom property to ensure the message is intended for your script
        if (customProperty !== 'SFHelper') return;

        if (type === 'HORDE_APP_DATA') {
            console.log('Received app data for Horde:', data);
            showHordeModal('Please wait, getting app info');
            fillHordeForm(data);
        }
    });


    function fillHordeForm(data) {

        // Validate if fields were filled to avoid sending an empty form

        function validateFields(item) {
            const appNameInput = Array.from(document.querySelectorAll('label'))
                .find(label => {
                    const text = label.textContent;
                    return item.distributionMethod === 'CODE_PLUGIN' ? 
                        text.includes('Plugin Items') : 
                        text.includes('AssetPack/CompleteProject Items');
                })
                ?.nextElementSibling?.querySelector('input');
    
            const versionInput = Array.from(document.querySelectorAll('label'))
                .find(label => {
                    const text = label.textContent;
                    return item.distributionMethod === 'CODE_PLUGIN' ? 
                        text.includes('Custom Engine Version') : 
                        text.includes('AssetPack/CompleteProject Versions');
                })
                ?.nextElementSibling?.querySelector('input');
    
            // Check if inputs exist and have values
            if (!appNameInput?.value) {
                console.error('App name field not filled');
                return false;
            }
            if (!versionInput?.value) {
                console.error('Version field not filled');
                return false;
            }
    
            // Verify values match what we tried to set
            if (appNameInput.value !== item.appName) {
                console.error(`App name mismatch. Expected: ${item.appName}, Got: ${appNameInput.value}`);
                return false;
            }
            
            const expectedVersion = item.distributionMethod === 'CODE_PLUGIN' ? 
                item.customEngineVersion : 
                item.earliestUEVersion;
            
            if (versionInput.value !== expectedVersion) {
                console.error(`Version mismatch. Expected: ${expectedVersion}, Got: ${versionInput.value}`);
                return false;
            }
    
            return true;
        }

        function waitForButton(selector, timeout = 10000) {
            return new Promise((resolve) => {
                let checkInterval;
                let timeoutId;
        
                const cleanup = () => {
                    if (checkInterval) clearInterval(checkInterval);
                    if (timeoutId) clearTimeout(timeoutId);
                };
        
                checkInterval = setInterval(() => {
                    let button;
                    if (selector === 'start-job') {
                        button = Array.from(document.querySelectorAll('button.ms-Button.ms-Button--primary'))
                            .find(btn => btn.querySelector('.ms-Button-label')?.textContent === 'Start Job');
                    } else {
                        button = document.querySelector(selector);
                    }
                    
                    if (button) {
                        cleanup();
                        resolve(button);
                    }
                }, 100);
        
                timeoutId = setTimeout(() => {
                    cleanup();
                    console.error(`Button ${selector} not found after ${timeout/1000} seconds`);
                    resolve(null);
                }, timeout);
            });
        }
    
        // countdown before clicking start job
        async function showCountdownModal(seconds) {
            let countdownInterval;
            let isCancelled = false;
        
            return new Promise((resolve, reject) => {
                const modal = document.createElement('div');
                modal.id = 'countdown-modal';
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', 'true');
                modal.style.cssText = `
                    position: fixed;
                    color: white;
                    top: 10%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: black;
                    padding: 20px;
                    border: 2px solid #ccc;
                    border-radius: 10px;
                    z-index: 2147483647;  /* Maximum possible z-index */
                    text-align: center;
                    min-width: 300px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                `;
        
                // Add overlay to capture clicks
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.2);
                    z-index: 2147483646;
                `;
                document.body.appendChild(overlay);
        
                const messageDiv = document.createElement('div');
                messageDiv.style.cssText = 'font-size: 18px; margin-bottom: 15px;';
                modal.appendChild(messageDiv);
        
                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = 'Cancel';
                cancelBtn.style.cssText = `
                    padding: 8px 20px;
                    background: #dc3545;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    position: relative;
                    z-index: 2147483647;
                `;
        
                // Use mousedown instead of click
                cancelBtn.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    isCancelled = true;
                    clearInterval(countdownInterval);
                    modal.remove();
                    overlay.remove();
                    reject('cancelled');
                }, true);
        
                modal.appendChild(messageDiv);
                modal.appendChild(cancelBtn);
                
                // Force the modal to the body end to ensure highest z-index
                document.body.appendChild(modal);
                
                // Try to break focus trap
                setTimeout(() => {
                    cancelBtn.focus();
                    // Try to find and disable any existing focus traps
                    const existingTraps = document.querySelectorAll('[aria-modal="true"]');
                    existingTraps.forEach(trap => {
                        if (trap !== modal) {
                            trap.setAttribute('aria-modal', 'false');
                        }
                    });
                }, 0);
        
                let remainingSeconds = seconds;
                // Set initial message with innerHTML
                messageDiv.innerHTML = `Starting job in ${remainingSeconds} seconds...<br><span style="color: yellow; font-weight: bold;">Please verify that the job parameters are correct <br>or cancel the job creation</span>`;

                countdownInterval = setInterval(() => {
                    if (isCancelled) return;
                    
                    remainingSeconds--;
                    messageDiv.innerHTML = `Starting job in ${remainingSeconds} seconds...<br><span style="color: yellow; font-weight: bold;">Please verify that the job parameters are correct <br>or cancel the job creation</span>`;

                    if (remainingSeconds <= 0) {
                        clearInterval(countdownInterval);
                        modal.remove();
                        overlay.remove();
                        resolve();
                    }
                }, 1000);
            });
        }
        async function processForm() {
            try {
                await new Promise(resolve => setTimeout(resolve, 1000));
        
                const formButton = await waitForButton('#id__41');
                if (!formButton) {
                    throw new Error('Initial form button not found');
                }
                formButton.click();
        
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                closeModal();
        
                for (const item of data) {
                    console.log('Processing item:', item);
                    
                    if (item.distributionMethod === 'CODE_PLUGIN') {
                        fillInput('Plugin Items', item.appName);
                        fillInput('Custom Engine Version', item.customEngineVersion);
                    } else {
                        fillInput('AssetPack/CompleteProject Items', item.appName);
                        fillInput('AssetPack/CompleteProject Versions', item.earliestUEVersion);
                    }
        
                    if (item.targetPlatforms.length === 1 && item.targetPlatforms[0] === 'Windows') {
                        uncheckCheckbox('Mac');
                    }
                }
        
                // Validate all fields before proceeding
                const isValid = data.every(item => validateFields(item));
                if (!isValid) {
                    throw new Error('Form validation failed - some fields were not filled correctly');
                }
        
                const startJobButton = await waitForButton('start-job');
                if (!startJobButton) {
                    throw new Error('Start Job button not found');
                }
        
                // Show countdown modal
                console.log('Form validation passed, starting countdown...');
                try {
                    await showCountdownModal(20);
                    console.log('Countdown completed, submitting form...');
                    startJobButton.click();
                    console.log('Form submitted successfully');
                } catch (error) {
                    console.log('Submission cancelled or error occurred:', error.message);
                    return; // Exit without clicking the start job button
                }
                
            } catch (error) {
                console.error('Error in processForm:', error);
                alert(`Error processing form: ${error.message}`);
            }
        }
    
        // Start the form processing
       
        processForm();
    }
    
    function fillInput(labelText, value) {
        const input = Array.from(document.querySelectorAll('label'))
            .find(label => label.textContent.includes(labelText))
            ?.nextElementSibling?.querySelector('input');
        
        if (!input) {
            console.error(`Input for "${labelText}" not found`);
            return;
        }
    
        try {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeInputValueSetter.call(input, value);
    
            const inputEvent = new Event('input', { bubbles: true });
            const changeEvent = new Event('change', { bubbles: true });
            input.dispatchEvent(inputEvent);
            input.dispatchEvent(changeEvent);
            
            console.log(`Successfully set value for ${labelText}: ${value}`);
        } catch (error) {
            console.error(`Error setting value for ${labelText}:`, error);
        }
    }
    
    function uncheckCheckbox(labelText) {
        const checkbox = Array.from(document.querySelectorAll('label'))
            .find(label => label.textContent.includes(labelText))
            ?.previousElementSibling;
        
        if (!checkbox) {
            console.error(`Checkbox for "${labelText}" not found`);
            return;
        }
    
        if (checkbox.checked) {
            try {
                checkbox.click();
                console.log(`Successfully unchecked ${labelText} checkbox`);
            } catch (error) {
                console.error(`Error unchecking ${labelText} checkbox:`, error);
            }
        }
    }

    const MODAL_IDS = {
        HORDE: 'custom-modal-unique',
        COUNTDOWN: 'countdown-modal'
    };

    
function showHordeModal(message) {
    console.log('Creating modal with message:', message);
    const modal = document.createElement('div');
    modal.id = MODAL_IDS.HORDE;  // Use consistent ID
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 300px;
        background: white;
        border: 2px solid #ccc;
        border-radius: 10px;
        padding: 15px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        z-index: 1000000;
        text-align: center;
    `;
    modal.innerHTML = `<p>${message}</p>`;
    document.body.appendChild(modal);
}

function closeModal() {
    // Close all possible modals
    Object.values(MODAL_IDS).forEach(id => {
        const modal = document.getElementById(id);
        if (modal) {
            console.log(`Closing modal: ${id}`);
            modal.remove();
        }
    });
}

    
        // Function to observe page content and initialize UI
function observePageContent() {
    const observer = new MutationObserver(() => {
        if (document.querySelector('body')) { // Ensure the body is fully loaded
            observer.disconnect(); // Stop observing once the content is ready
            if (window.location.href.startsWith(SALESFORCE_URL)) {
                console.log('Salesforce page detected. Initializing UI...');
                initializeUI(); // Initialize the buttons
            }
        }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
}

// Start observing the page content only if not on Tanda URL
if (!window.location.href.startsWith(TANDA_URL)) {
    observePageContent();
}

    // Tanda-specific logic
if (window.location.href.startsWith(TANDA_URL)) {
    const referer = document.referrer;
    const isFromSalesforce = referer.startsWith(SALESFORCE_URL);

    if (isFromSalesforce) {
        showAlertModal('Please wait, we are getting your shifts!', false); // Show the modal without auto-close

        const tandaScript = async () => {
            try {
                const userIdElement = document.querySelector('[data-store-staff-filters-current-user-id-value]');
                const tandaID = userIdElement?.getAttribute('data-store-staff-filters-current-user-id-value');

                if (!tandaID) {
                    alert('Failed to retrieve Tanda ID.');
                    return;
                }

                console.log('Tanda ID:', tandaID);

                const initialUrl = `https://my.tanda.co/rosters/for/${tandaID}`;
                console.log(`Fetching content from: ${initialUrl}`);

                // Fetch the initial page content
                const response = await fetch(initialUrl, { credentials: 'include' });
                const htmlText = await response.text();

                // Parse the page to find the embedded URL
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');
                const spanElement = doc.querySelector('span[data-clipboard-text]');
                const embeddedUrl = spanElement?.getAttribute('data-clipboard-text');

                if (!embeddedUrl) {
                    alert('No URL found in the data-clipboard-text attribute.');
                    return;
                }

                console.log('Found embedded URL:', embeddedUrl);

                // Fetch the content from the embedded URL
                const embeddedResponse = await fetch(embeddedUrl, { credentials: 'include' });
                const shiftData = await embeddedResponse.text();

                console.log('Shift data retrieved successfully:', shiftData);

                // Close the modal
                const existingModal = document.getElementById('custom-modal');
                if (existingModal) {
                    existingModal.remove();
                }

                // Send shift data to the Salesforce tab
                window.opener.postMessage({ type: 'SHIFT_DATA', data: shiftData }, SALESFORCE_URL);

                alert('Shifts added. Returning to Salesforce.');
                window.close();
            } catch (error) {
                console.error('Error:', error);
                alert('An error occurred while fetching shift data.');
            }
        };

        tandaScript();
    }
}

    // Helper function to traverse Shadow DOM and find all matching elements don't modify
    function getAllShadowElements(root, selector) {
        const elements = [];
        const traverse = (node) => {
            if (!node) return;
            if (node.shadowRoot) {
                elements.push(...node.shadowRoot.querySelectorAll(selector));
                Array.from(node.shadowRoot.children).forEach(traverse);
            }
            Array.from(node.children).forEach(traverse);
        };
        traverse(root);
        return elements;
    }

     // Extract version number from metadata block
     const version = GM_info.script.version;

    let reminderTimers = []; // Define the reminderTimers array
    let isPageLoading = true; // Flag to check if the page is still loading
    let pageNotLoadedMessage = 'Please wait for the page to load or Open a case first'; // Message to display when the page is still loading

    // Function to check if the page is fully loaded
function checkPageLoading() {
    const selector = 'dd.slds-item_detail.slds-truncate'; // Your key selector
    
    // Use the reusable helper function
    const elements = getAllShadowElements(document.body, selector);

    if (elements.length > 0) {
        console.log('Page is fully loaded');
        isPageLoading = false; // Set the flag to false when elements are detected
    } else {
        console.log('Page is still loading...');
        isPageLoading = true; // Set the flag to true if elements are not found
    }
}
    
// Call the function to start checking
checkPageLoading();

   // Function to show a modal with a message if the page is not fully loaded
   function showAlertModal(message, autoClose = true) {
    const modal = document.createElement('div');
    modal.id = 'custom-modal';
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border: 1px solid #ccc;
        border-radius: 5px;
        z-index: 10000;
    `;

    const messageDiv = document.createElement('div');
    messageDiv.innerText = message;
    modal.appendChild(messageDiv);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        justify-content: center;
        margin-top: 10px;
    `;

    const okButton = document.createElement('button');
    okButton.innerText = 'Ok';
    okButton.style.cssText = `
        padding: 10px;
        background: yellow !important;
        color: black !important;
        border: none;
        border-radius: 5px;
        cursor: pointer;
    `;
    okButton.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    buttonContainer.appendChild(okButton);

    modal.appendChild(buttonContainer);
    document.body.appendChild(modal);

    if (autoClose) {
        // Automatically close the modal after 2 seconds
        setTimeout(() => {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
        }, 2000);
    }
}

    

    // Function to find text in Shadow DOM
    function findTextInShadow(root, searchText) {
        let foundNode = null;

        const traverse = (node) => {
            if (!node) return;

            // Check if this node's text content matches the search text
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === searchText) {
                console.log("Found text in node:", node);
                foundNode = node;
                return;
            }

            // Traverse into Shadow DOM if present
            if (node.shadowRoot) {
                Array.from(node.shadowRoot.childNodes).forEach(traverse);
            }

            // Traverse normal child nodes
            Array.from(node.childNodes).forEach(traverse);
        };

        traverse(root);

        if (!foundNode) {
            console.log(`No element or text node with text "${searchText}" found.`);
        }

        return foundNode;
    }

    // Secondary function to find text in Shadow DOM, used to retrieve the FAB url

    function findTextInShadowDOM(root, searchText) {
        let foundNode = null;

        const traverse = (node) => {
            if (!node) return;

            if (node.nodeType === Node.TEXT_NODE && node.textContent.includes(searchText)) {
                foundNode = node;
                return;
            }

            if (node.shadowRoot) {
                Array.from(node.shadowRoot.childNodes).forEach(traverse);
            }

            Array.from(node.childNodes).forEach(traverse);
        };

        traverse(root);
        return foundNode;
    }

    // Helper function to find an element by attribute in Shadow DOM

    function findElementByAttribute(root, tagName, attribute, value) {
        const results = [];
    
        const traverse = (node) => {
            if (!node) return;
    
            // Check if the node matches the tag name and attribute value
            if (node.nodeType === Node.ELEMENT_NODE &&
                node.tagName === tagName.toUpperCase() &&
                node.getAttribute(attribute) === value) {
                results.push(node);
            }
    
            // Traverse into Shadow DOM if present
            if (node.shadowRoot) {
                Array.from(node.shadowRoot.childNodes).forEach(traverse);
            }
    
            // Traverse normal child nodes
            Array.from(node.childNodes).forEach(traverse);
        };
    
        traverse(root);
    
        if (results.length > 0) {
            console.log(`Found ${results.length} matching element(s):`, results);
        } else {
            console.log(`No <${tagName}> element with ${attribute}="${value}" found.`);
        }
        
        return results;
    }

    // Function to close any existing modal

    function closeExistingModal() {
        const existingModal = document.getElementById('custom-modal');
        if (existingModal) {
            existingModal.remove();
            console.log('Existing modal closed.');
        }

        const shiftSection = document.getElementById('shift-section');
        if (shiftSection) {
            shiftSection.remove();
            console.log('Shift section closed.');
        }
    }


// Dark overlay

let overlayInstance = null; // Keep track of the overlay instance

function createOverlay() {
    if (overlayInstance) {
        return overlayInstance; // Return the existing overlay if already created
    }

    const shadowHost = document.createElement('div');
    shadowHost.id = 'sf-helper-overlay-shadow';
    shadowHost.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 9999;
        pointer-events: none; /* Allow clicks to pass through */
    `;

    const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background-color: rgba(0, 0, 0, 0) !important; /* Start with transparent */
        transition: background-color 0.3s ease-in-out !important; /* Smooth transition */
        z-index: 9999 !important;
        pointer-events: none !important; /* Allow clicks to pass through */
    `;

    shadowRoot.appendChild(overlay);

    // Delay applying the rgba color to trigger the transition
    setTimeout(() => {
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
    }, 10);

    // Add click listener to document to detect clicks anywhere
    const clickHandler = (e) => {
        // Check if the click target is not part of your application's UI that should keep the overlay
        // You might want to customize this condition based on your needs
        if (!e.target.closest('.keep-overlay')) {
            removeOverlay();
            // Remove the click listener after overlay is removed
            document.removeEventListener('click', clickHandler);
        }
    };

    // Add the click listener with a small delay to prevent immediate triggering
    setTimeout(() => {
        document.addEventListener('click', clickHandler);
    }, 100);

    document.body.appendChild(shadowHost);
    overlayInstance = shadowHost;

    return shadowHost;
}

function removeOverlay() {
    if (overlayInstance) {
        const overlay = overlayInstance.shadowRoot.querySelector('div');
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0)'; // Fade out
        setTimeout(() => {
            overlayInstance.remove(); // Remove after transition
            overlayInstance = null; // Clear the instance reference
        }, 300); // Match the transition duration
    }
}





//Function to get the FAB url

async function getFabURL(caseNumber) {
    const tabElement = document.querySelector(`a[title^="${caseNumber}"]`);
    if (!tabElement) {
        console.error('Tab element not found.');
        return null;
    }

    const ariaControls = tabElement.getAttribute('aria-controls');
    if (!ariaControls) {
        console.error('aria-controls attribute not found.');
        return null;
    }

    const sectionElement = document.getElementById(ariaControls);
    if (!sectionElement) {
        console.error('Section element not found.');
        return null;
    }

    const searchText = "https://fab-admin.daec.live.use1a.on.epicgames.com/admin/listings/listing/";
    const node = findTextInShadowDOM(sectionElement, searchText);

    if (!node) {
        console.error('Django URL not found.');
        return null;
    }

    const djangoURL = node.textContent.trim();
    console.log('Django URL:', djangoURL);

    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: djangoURL,
            onload: function (response) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(response.responseText, 'text/html');
                const fabLink = doc.querySelector('a.link[href*="/portal/listings/"][href*="/preview"]');

                if (fabLink) {
                    const fabURL = `https://fab-admin.daec.live.use1a.on.epicgames.com${fabLink.getAttribute('href')}`;
                    console.log('Final FAB URL:', fabURL);
                    resolve(fabURL);
                } else {
                    console.error('PDP Preview link not found.');
                    resolve(null);
                }
            },
            onerror: function () {
                console.error('Failed to fetch Django URL content.');
                reject('Failed to fetch Django URL content.');
            }
        });
    });
}

       // Define the TRC templates IDs
    const templateSheetIds = new Map([
        ['Props / Environments', ''],
        ['Characters', ''],
        ['Blueprints', ''],
        ['Plugins', ''],
        ['Audio packs', ''],
        ['Materials / 2D assets', ''],
        ['Animations', ''],
        ['VFX', ''],
        ['Blank TRC (Original)', '']
    ]);

    // Function to show a modal and collect user input
    function showModal(message, callback, defaultValue = '') {
        const overlay = createOverlay();
        document.body.appendChild(overlay);
        const modal = document.createElement('div');
        modal.id = 'custom-modal';
        modal.className = 'keep-overlay';  // class to avoid closing the dark overlay when clicking any button in the script
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border: 1px solid #ccc;
            border-radius: 5px;
            z-index: 10000;
        `;

        const messageDiv = document.createElement('div');
        messageDiv.innerText = message;
        modal.appendChild(messageDiv);

        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultValue;
        input.style.cssText = `
            width: 100%;
            padding: 10px;
            margin-top: 10px;
            border: 1px solid #ccc;
            border-radius: 5px;
        `;
        modal.appendChild(input);

        const noteDiv = document.createElement('div');
        noteDiv.innerText = '(You only need to do this one time)';
        noteDiv.style.cssText = `
            margin-top: 5px;
            font-size: 12px;
            color: #555;
        `;
        modal.appendChild(noteDiv);

        const link = document.createElement('a');
        link.href = 'https://docs.google.com/document/d/1uEeayASYOLTKaD5J3UBFcM-9F2KYivbOIhBoXvOsAWM/edit?usp=sharing'; // Replace with the actual documentation link
        link.target = '_blank';
        link.innerText = 'Not sure about this? Read Documentation, worth it :)';
        link.style.cssText = `
            display: block;
            margin-top: 10px;
            color: #007bff;
            text-decoration: underline;
        `;
        modal.appendChild(link);


        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
        `;

        const submitButton = document.createElement('button');
        submitButton.innerText = 'Submit';
        submitButton.style.cssText = `
            padding: 10px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        `;
        submitButton.addEventListener('click', () => {
            const value = input.value.trim();
            if (value) {
                callback(value);
                document.body.removeChild(modal);
                removeOverlay();
            } else {
                alert('Please enter a value.');
            }
        });
        buttonContainer.appendChild(submitButton);

        const cancelButton = document.createElement('button');
        cancelButton.innerText = 'Cancel';
        cancelButton.style.cssText = `
            padding: 10px;
            background: #f44336;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        `;
        cancelButton.addEventListener('click', () => {
            document.body.removeChild(modal);
            removeOverlay();
        });
        buttonContainer.appendChild(cancelButton);

        modal.appendChild(buttonContainer);

        document.body.appendChild(modal);
    }

    // Function to prompt user for information and store it in local storage
function promptForInfo(key, message, callback) {
    let value = localStorage.getItem(key);
    if (!value) {
        showModal(message, (inputValue) => {
            const extractedId = extractGoogleId(inputValue);
            if (extractedId) {
                localStorage.setItem(key, extractedId);
                callback(extractedId);
            } else {
                alert('Invalid URL. Please enter a valid Google Sheet or Drive Folder URL.');
            }
        });
    } else {
        callback(value);
    }
}

// Helper function to extract Google Sheet ID or Google Drive Folder ID from URL
function extractGoogleId(url) {
    const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)\//);
    const folderIdMatch = url.match(/\/folders\/([a-zA-Z0-9-_]+)/);

    if (sheetIdMatch) {
        return sheetIdMatch[1];
    } else if (folderIdMatch) {
        return folderIdMatch[1];
    } else {
        return null;
    }
}

// Function to get user information from local storage or prompt if not available
function getUserInfo(callback) {
    promptForInfo('folderId', 'Please enter your Google Drive folder URL:', (folderId) => {
        callback({ folderId });
    });
}

// Function to get TRC template ID from local storage or prompt if not available
function getTemplateSheetId(template, callback) {
    promptForInfo(template, `Please enter the Google Sheet URL for the ${template} template:`, (sheetId) => {
        callback(sheetId);
    });
}

    // Function to show a modal to edit stored template IDs and folder ID
    function showEditModal() {
        const modal = document.createElement('div');
        modal.id = 'custom-modal';
        modal.className = 'keep-overlay';  // class to avoid closing the dark overlay when clicking any button in the script
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border: 1px solid #ccc;
            border-radius: 5px;
            z-index: 10000;
            max-height: 80%;
            overflow-y: auto;
        `;
    
        const title = document.createElement('h3');
        title.innerHTML = 'Edit Google Sheets Templates and Drive folder<hr>';
        modal.appendChild(title);
    
        const form = document.createElement('form');
        form.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';
    
        // Add input fields for each template ID
        templateSheetIds.forEach((_, template) => {
            const storedValue = localStorage.getItem(template) || '';
            const label = document.createElement('label');
            label.innerText = `${template} Template URL:`;
            form.appendChild(label);
    
            const input = document.createElement('input');
            input.type = 'text';
            // Convert stored ID back to a URL format for display
            input.value = storedValue ? `https://docs.google.com/spreadsheets/d/${storedValue}/edit` : '';
            input.dataset.template = template;
            input.dataset.originalValue = storedValue; // Store the original value
            input.placeholder = 'Enter Google Sheet URL';
            input.style.cssText = `
                width: 100%;
                padding: 10px;
                border: 1px solid #ccc;
                border-radius: 5px;
            `;
            form.appendChild(input);
        });
    
        // Add input field for folder ID
        const folderLabel = document.createElement('label');
        folderLabel.innerText = 'Google Drive Folder URL:';
        form.appendChild(folderLabel);
    
        const storedFolderId = localStorage.getItem('folderId') || '';
        const folderInput = document.createElement('input');
        folderInput.type = 'text';
        // Convert stored ID back to a URL format for display
        folderInput.value = storedFolderId ? `https://drive.google.com/drive/folders/${storedFolderId}` : '';
        folderInput.dataset.template = 'folderId';
        folderInput.dataset.originalValue = storedFolderId; // Store the original value
        folderInput.placeholder = 'Enter Google Drive Folder URL';
        folderInput.style.cssText = `
            width: 100%;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 5px;
        `;
        form.appendChild(folderInput);
    
        modal.appendChild(form);
    
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
        `;
    
        const saveButton = document.createElement('button');
        saveButton.innerText = 'Save';
        saveButton.style.cssText = `
            padding: 10px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        `;
        saveButton.addEventListener('click', (event) => {
            event.preventDefault();
            const inputs = form.querySelectorAll('input');
            inputs.forEach(input => {
                const key = input.dataset.template;
                const value = input.value.trim();
                const originalValue = input.dataset.originalValue;
    
                if (value === '') {
                    // If the input is empty, keep the original value
                    if (originalValue) {
                        localStorage.setItem(key, originalValue);
                    }
                } else {
                    // Only update if the value has changed
                    const extractedId = extractGoogleId(value);
                    if (extractedId && extractedId !== originalValue) {
                        localStorage.setItem(key, extractedId);
                    } else if (!extractedId && originalValue) {
                        // If new value is invalid but we have an original value, keep it
                        localStorage.setItem(key, originalValue);
                    }
                }
            });
            document.body.removeChild(modal);
            removeOverlay();
        });
        buttonContainer.appendChild(saveButton);
    
        const cancelButton = document.createElement('button');
        cancelButton.innerText = 'Cancel';
        cancelButton.style.cssText = `
            padding: 10px;
            background: #f44336;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        `;
        cancelButton.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        buttonContainer.appendChild(cancelButton);
    
        modal.appendChild(buttonContainer);
    
        document.body.appendChild(modal);
    }

function initializeUI() {
    console.log('Initializing UI...');

    // Check if buttons already exist
    if (document.getElementById('assign-to-me-button')) {
        console.log('Buttons already initialized.');
        return; // Avoid duplicating buttons
    }

    // Create sections for buttons
    const section1 = createSection('section1', '100px');
    const section2 = createSection('section2', '330px');
    const section3 = createSection('section3', '580px');

    // Store original positions
    section1.dataset.originalTop = section1.style.top;
    section2.dataset.originalTop = section2.style.top;
    section3.dataset.originalTop = section3.style.top;

    // Create the "Assign to Me" button (Yellow)
    const assignToMeButton = createButton('Assign to Me', '#ffc107', () => {
        checkPageLoading();
        if (isPageLoading) {
            showAlertModal(pageNotLoadedMessage);
            return;
        }
        const caseId = getCaseIdFromURL();
        if (caseId) {
            assignCaseToMe(caseId);
        } else {
            alert('Case ID not found!');
        }
    });
    section1.appendChild(assignToMeButton);

    // Create the "Get Info" button (Blue)
    const getInfoButton = createButton('Get Info', '#007bff', () => {
        checkPageLoading();
        if (isPageLoading) {
            showAlertModal(pageNotLoadedMessage);
            return;
        }
    
        const info = processListingContent();
      
      
    });
    section1.appendChild(getInfoButton);

    // Create the "Copy SF Case" button (Green)
    const copyCaseButton = createButton('Copy SF Case', '#11eded', () => {
        checkPageLoading();
        if (isPageLoading) {
            showAlertModal(pageNotLoadedMessage);
            return;
        }
        const caseNumber = getCaseNumber();
        if (caseNumber) {
            navigator.clipboard.writeText(caseNumber).then(() => {
                copyCaseNotification.show();
            });
        } else {
            alert('SF Case Number not found!');
        }
    });

    // Create notification for the Copy Case button
    const copyCaseNotification = createCopyNotification(copyCaseButton);
    section1.appendChild(copyCaseNotification.wrapper);

    // Create the TRC template submenu
    const trcTemplateMenu = document.createElement('div');
    trcTemplateMenu.style.cssText = `
        position: absolute;
        top: 0;
        left: -200px;
        width: 180px;
        border: 1px solid #ccc;
        border-radius: 5px;
        padding: 10px;
        background: white;
        z-index: 10000;
        display: none;
    `;

    const trcTemplateLabel = document.createElement('div');
    trcTemplateLabel.innerText = 'Select TRC Template:';
    trcTemplateLabel.style.cssText = 'margin-bottom: 10px;';
    trcTemplateMenu.appendChild(trcTemplateLabel);

    templateSheetIds.forEach((sheetId, template) => {
        const option = document.createElement('div');
        option.innerText = template;
        option.style.cssText = `
            background: ${template === 'Blank TRC (Original)' ? '#d8b2d8' : '#6f42c1'};
            color: white;
            border: none;
            border-radius: 5px;
            padding: 10px;
            margin: 5px 0; /* Add margin to separate buttons */
            cursor: pointer;
            text-align: center;
        `;
        option.addEventListener('click', () => {
            trcTemplateMenu.style.display = 'none';
            openNewTabWithTemplate(template);
            removeOverlay();
        });
        trcTemplateMenu.appendChild(option);
    });


   // Edit button for stored template IDs and folder ID
        const editButton = document.createElement('div');
        editButton.innerText = 'Edit';
        editButton.style.cssText = `
            background: #ff9800;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 10px;
            margin: 5px 0; /* Add margin to separate buttons */
            cursor: pointer;
            text-align: center;
        `;
        editButton.addEventListener('click', () => {
            showEditModal();

        });
        trcTemplateMenu.appendChild(editButton);
    

    section1.appendChild(trcTemplateMenu);

    // Create the "Create TRC" button (Purple)
    const createTRCButton = createButton('Create TRC', '#6f42c1', (event) => {
        checkPageLoading();
        if (isPageLoading) {
            showAlertModal(pageNotLoadedMessage);
            return;
        }
        event.stopPropagation(); // Prevent event bubbling
        closeExistingModal();
        removeOverlay();
        
        // Show the menu
        trcTemplateMenu.style.display = 'block';
        
        // Add a small delay before adding the event listeners
        setTimeout(() => {
            // Add mouseleave handlers
            createTRCButton.addEventListener('mouseleave', handleButtonMouseLeave);
            trcTemplateMenu.addEventListener('mouseleave', handleMenuMouseLeave);
            
            // Add click handler to document to close menu when clicking outside
            document.addEventListener('click', handleDocumentClick);
        }, 100);
    });

    // Handler functions
    const handleButtonMouseLeave = () => {
        setTimeout(() => {
            if (!trcTemplateMenu.matches(':hover')) {
                trcTemplateMenu.style.display = 'none';
                removeEventListeners();
            }
        }, 500);
    };

    const handleMenuMouseLeave = () => {
        if (!createTRCButton.matches(':hover')) {
            trcTemplateMenu.style.display = 'none';
            removeEventListeners();
        }
    };

    const handleDocumentClick = (event) => {
        if (!trcTemplateMenu.contains(event.target) && event.target !== createTRCButton) {
            trcTemplateMenu.style.display = 'none';
            removeEventListeners();
        }
    };

    // Function to remove event listeners
    const removeEventListeners = () => {
        createTRCButton.removeEventListener('mouseleave', handleButtonMouseLeave);
        trcTemplateMenu.removeEventListener('mouseleave', handleMenuMouseLeave);
        document.removeEventListener('click', handleDocumentClick);
    };

    section1.appendChild(createTRCButton);

    // Create a small centered text in yellow
const caseStatusText = document.createElement('div');
caseStatusText.innerText = 'Change Case Status:';
caseStatusText.style.cssText = `
    text-align: center;
    color: black;
    font-size: 11px;
    margin-bottom: 4px;
    margin-top: -4px;
`;

// Append the text to the top of section2
section2.appendChild(caseStatusText);

    // Create the "Approve" button (Light Green)
    const approveButton = createButton('Approve', '#11ed11', () => {
        checkPageLoading();
        if (isPageLoading) {
            showAlertModal(pageNotLoadedMessage);
            return;
        }
        changeStatus('approve-button');
    });
    approveButton.id = 'approve-button';
    section2.appendChild(approveButton);

    // Create the "Changes Needed" button (Orange)
    const changesNeededButton = createButton('Changes Needed', '#ff9800', () => {
        checkPageLoading();
        if (isPageLoading) {
            showAlertModal(pageNotLoadedMessage);
            return;
        }
        changeStatus('changes-needed-button');
    });
    changesNeededButton.id = 'changes-needed-button';
    section2.appendChild(changesNeededButton);

    // Create the "Decline" button (Red)
    const declineButton = createButton('Decline', '#f44336', () => {
        checkPageLoading();
        if (isPageLoading) {
            showAlertModal(pageNotLoadedMessage);
            return;
        }
        changeStatus('decline-button');
    });
    declineButton.id = 'decline-button';
    section2.appendChild(declineButton);

    // Create the "Close" button (Gray)
    const closeButton = createButton('Close', '#808080', () => {
        checkPageLoading();
        if (isPageLoading) {
            showAlertModal(pageNotLoadedMessage);
            return;
        }
        changeStatus('close-button');
    });
    closeButton.id = 'close-button';
    section2.appendChild(closeButton);

    // Create the "Case Log" button
    const viewLogButton = createButton('Case Log', '#ff5722', () => {
        viewCaseLog(); // Call the function to display the log
    });
    section3.appendChild(viewLogButton);

    // Create the "Add my shift" button (Purple)
    const addShiftButton = createButton('Add my shift', '#6f42c1', () => {
        showTandaModal();
    });


    if (!localStorage.getItem('parsedTandaScheduleData')) {
        section3.appendChild(addShiftButton);
    }

    // Check if shifts are stored and if a shift has started but not finished or finished within the last hour
const relevantShift = getRelevantShiftIfExists();
if (relevantShift) {
    const shiftReportButton = createButton('Shift Report', '#007bff', () => {
        showShiftReportModal(relevantShift.start, relevantShift.end, relevantShift.duration);
    });
    section3.appendChild(shiftReportButton);
}

// Create the "Show Shifts" button (Blue) only if shifts are stored in local storage
    if (localStorage.getItem('parsedTandaScheduleData')) {
        const showShiftsButton = createButton('Show Shifts', '#007bff', () => {
            displayShiftInfo();
        });
        section3.appendChild(showShiftsButton);
    }

    // Create the "Reset all" button (Red)
    const resetAllButton = document.createElement('button');
    resetAllButton.innerText = 'Reset all';
    resetAllButton.style.cssText = `
        background: #f44336;
        color: white;
        border: none;
        border-radius: 5px;
        padding: 2px 2px;
        cursor: pointer;
        margin-top: 10px;
    `;


    resetAllButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all settings and stored information (Shifts, Cases, Sheets ID, etc)? This action cannot be undone.')) {
            // Clear all relevant local storage items
            localStorage.removeItem('parsedTandaScheduleData');
            localStorage.removeItem('sfCaseLog');
            localStorage.removeItem('folderId');
            localStorage.removeItem('reminderCheckboxState');
            templateSheetIds.forEach((_, key) => {
                localStorage.removeItem(key);
            });
            alert('All settings have been reset.');
            location.reload(); // Reload the page to apply changes
        }
    });
    section3.appendChild(resetAllButton);

    // Create a container for the reset button
    const resetButtonContainer = document.createElement('div');
    resetButtonContainer.style.cssText = 'margin-top: 0px; margin-bottom: 5px;';
    resetButtonContainer.appendChild(resetAllButton);
    section3.appendChild(resetButtonContainer);

    // Append sections to the body
    document.body.appendChild(section1);
    document.body.appendChild(section2);
    document.body.appendChild(section3);

    // Create and append the collapse/expand button
    const collapseButton = createCollapseButton();
    document.body.appendChild(collapseButton);

    // Make the sections draggable
    makeDraggable(collapseButton);

    // Observe URL changes and close modal if necessary
    observeURLChanges();

    // Check if tandaData exists and show the reminder checkbox
    if (localStorage.getItem('parsedTandaScheduleData')) {
        const reminderCheckbox = document.createElement('input');
        reminderCheckbox.type = 'checkbox';
        reminderCheckbox.id = 'reminderCheckbox';
        reminderCheckbox.style.marginLeft = '10px';

        const reminderLabel = document.createElement('label');
        reminderLabel.htmlFor = 'reminderCheckbox';
        reminderLabel.innerText = 'Clock-in/Out Reminders?';
        reminderLabel.style.marginLeft = '5px';

        section3.appendChild(reminderCheckbox);
        section3.appendChild(reminderLabel);

        // Restore checkbox state from localStorage
        const savedReminderCheckboxState = localStorage.getItem('reminderCheckboxState') === 'true';
        reminderCheckbox.checked = savedReminderCheckboxState;
        if (savedReminderCheckboxState) {
            setShiftReminders();
        }

        reminderCheckbox.addEventListener('change', () => {
            localStorage.setItem('reminderCheckboxState', reminderCheckbox.checked);
            if (reminderCheckbox.checked) {
                setShiftReminders();
            } else {
                clearShiftReminders();
            }
        });
    }
}

    function openNewTabWithTemplate(template) {
        console.log('Create TRC button clicked');


        // Retrieve the Case number
        const caseNumber = getCaseNumber();
        if (!caseNumber) {
            console.error('Case Number not found.');
            return;
        }

        console.log('Case Number:', caseNumber);

        // Find the aria-controls value associated with the active tab
        const tabElement = document.querySelector(`a[title^="${caseNumber}"]`);
        if (!tabElement) {
            console.error('Tab element not found.');
            return;
        }

        const ariaControls = tabElement.getAttribute('aria-controls');
        if (!ariaControls) {
            console.error('aria-controls attribute not found.');
            return;
        }

        console.log('aria-controls:', ariaControls);

        // Locate the section element with the corresponding ID
        const sectionElement = document.getElementById(ariaControls);
        if (!sectionElement) {
            console.error('Section element not found.');
            return;
        }

        console.log('Section element found:', sectionElement);

        // Retrieve the Product title directly from the section
        const productTitleElement = sectionElement.querySelector('lightning-formatted-text[title]');
        if (!productTitleElement) {
            console.error('Product Title element not found.');
            return;
        }

        const productTitle = productTitleElement.getAttribute('title');
        console.log('Product Title:', productTitle);

        // Retrieve the sheet ID from the Map
        getTemplateSheetId(template, (sheetID) => {
            if (!sheetID) {
                console.error('Sheet ID not found for template:', template);
                return;
            }

            // Retrieve user information from local storage
            getUserInfo(({ folderId }) => {
                // Open the custom HTML page in a new tab and pass the productTitle, caseNumber, sheetID, and user info as query parameters
                const newTabUrl = `https://212oscar.github.io/sforward/newTRC.html?productTitle=${encodeURIComponent(productTitle)}&caseNumber=${encodeURIComponent(caseNumber)}&sheetID=${encodeURIComponent(sheetID)}&folderId=${encodeURIComponent(folderId)}`;
                window.open(newTabUrl, '_blank');
            });
        });
    }

    function setShiftReminders() {
        clearShiftReminders(); // Clear any existing reminders
    
        const tandaData = localStorage.getItem('parsedTandaScheduleData');
        if (!tandaData) return;
    
        const shifts = JSON.parse(tandaData);
        const groupedShifts = groupShifts(shifts); // Group the shifts
    
        const now = new Date();
        const minimumDelay = 60 * 1000; // 1 minute minimum delay
    
        // Find active shift or next upcoming shift
        const relevantShifts = groupedShifts
            .filter(shift => {
                const shiftStart = new Date(shift.start);
                const shiftEnd = new Date(shift.end);
                // Include shift if it's active or it's the next upcoming shift
                return (shiftStart <= now && shiftEnd > now) || shiftStart > now;
            })
            .sort((a, b) => new Date(a.start) - new Date(b.start));
    
        if (relevantShifts.length === 0) return;
    
        // Only process the active shift (if any) and the next shift
        const shiftsToProcess = relevantShifts.slice(0, 2);
    
        shiftsToProcess.forEach((shift, index) => {
            const start = new Date(shift.start);
            const end = new Date(shift.end);
            const nextShift = shiftsToProcess[index + 1];
            
            const isActiveShift = start <= now && end > now;
            
            // Determine if this is part 1 of a split shift
            const isSplitShiftPart1 = nextShift && 
                end.getTime() === new Date(nextShift.start).getTime() &&
                shift.summary === nextShift.summary;
    
            // Calculate reminder times (2 minutes before)
            const clockInReminderTime = new Date(start.getTime() - 2 * 60 * 1000);
            const clockOutReminderTime = new Date(end.getTime() - 2 * 60 * 1000);
    
            // Calculate timeouts
            const clockInTimeout = clockInReminderTime.getTime() - now.getTime();
            const clockOutTimeout = clockOutReminderTime.getTime() - now.getTime();
    
            // Set clock-in reminder only for the next future shift if it's first part or non-split
            if (!isActiveShift && clockInTimeout > minimumDelay && (!isSplitShiftPart1 || index === 0)) {
                const clockInTimerId = setTimeout(() => {
                    showReminderModal(
                        'Your shift is starting, remember to:\n\n- Clock-in on Workforce app\n- Clock-in on Modsquad and Epic Games Slack',
                        start,
                        end
                    );
                }, clockInTimeout);
                reminderTimers.push(clockInTimerId);
            }
    
            // Set clock-out reminder if the end time is in the future
            if (clockOutTimeout > minimumDelay) {
                const clockOutTimerId = setTimeout(() => {
                    let message;
                    if (isSplitShiftPart1) {
                        message = 'First part of your shift is ending.\n\n' +
                                 'Please submit your shift report for this part and continue with the next part of your shift.';
                    } else {
                        message = 'Your shift is ending, remember to:\n\n' +
                                 '- Clock-out on Workforce app\n' +
                                 '- Clock-out on Modsquad Slack\n' +
                                 '- Send your shift report';
                    }
                    showReminderModal(message, start, end);
                }, clockOutTimeout);
                reminderTimers.push(clockOutTimerId);
            }
        });
    }

    function clearShiftReminders() {
        reminderTimers.forEach(timerId => clearTimeout(timerId));
        reminderTimers = [];
    }

    function showReminderModal(message, start, end) {
        const overlay = createOverlay();
        document.body.appendChild(overlay);
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 20%;
            left: 50%;
            transform: translate(-50%, -20%);
            width: 400px;
            background: white;
            border: 2px solid #ccc;
            border-radius: 10px;
            padding: 15px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            z-index: 10001;
        `;
    
        // Format times in both PST and local time
        const startPST = new Date(start).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
        const endPST = new Date(end).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
        const startLocal = new Date(start).toLocaleString();
        const endLocal = new Date(end).toLocaleString();
    
        const messageDiv = document.createElement('div');
        messageDiv.innerHTML = `
            <p>${message}</p>
            <p><strong>Time (PST):</strong> ${startPST} - ${endPST}</p>
            <p><strong>Time (Local):</strong> ${startLocal} - ${endLocal}</p>
        `;
        modal.appendChild(messageDiv);
    
        const allDoneButton = document.createElement('button');
        allDoneButton.innerText = 'All Done';
        allDoneButton.style.cssText = `
            margin-top: 20px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 10px;
            cursor: pointer;
        `;
        allDoneButton.addEventListener('click', () => {
            modal.remove();
            removeOverlay();
        });
    
        modal.appendChild(allDoneButton);
        document.body.appendChild(modal);
    }

    function createSection(id, top) {
        const section = document.createElement('div');
        section.id = id;
        section.className = 'keep-overlay';  // class to avoid closing the dark overlay when clicking any button in the script
        section.style.cssText = `
            position: fixed;
            top: ${top};
            right: 20px;
            width: 160px;
            border: 1px solid #ccc;
            border-radius: 5px;
            padding: 10px;
            background: white;
            z-index: 10000;
        `;
        return section;
    }

    function createButton(text, color, onClick) {
        const button = document.createElement('button');
        button.innerText = text;
        button.style.cssText = `
            width: 140px;
            background: ${color};
            color: #fff;
            border: none;
            border-radius: 5px;
            padding: 10px;
            margin-bottom: 10px;
            cursor: pointer;
        `;
        button.addEventListener('click', onClick);
        return button;
    }

    function createCollapseButton() {
        const button = document.createElement('button');
        button.innerHTML = `SF helper ${version} ▲`; // Use backticks for template literals
        button.style.cssText = `
            position: fixed;
            top: 50px;
            right: 20px;
            width: 170px; /* Increased width by 30px */
            background: #333;
            color: #fff;
            border: none;
            border-radius: 5px;
            padding: 10px;
            cursor: pointer;
            z-index: 10001;
            box-shadow: inset 0 0 0 2px gray; /* Inner gray border */
        `;

        const linkIcon = document.createElement('a');
        linkIcon.href = 'https://docs.google.com/document/d/1uEeayASYOLTKaD5J3UBFcM-9F2KYivbOIhBoXvOsAWM/edit?tab=t.bcuqnlw8w2b3';
        linkIcon.target = '_blank';
        linkIcon.innerText = '?';
        linkIcon.style.cssText = `
            color: #fff;
            text-decoration: none;
            margin-left: 5px;
            background: #555;
            border-radius: 50%;
            padding: 2px 6px;
            font-size: 12px;
        `;
        button.appendChild(linkIcon);

        button.addEventListener('click', () => {
            const sections = ['section1', 'section2', 'section3'];
            sections.forEach(id => {
                const section = document.getElementById(id);
                if (section.style.display === 'none') {
                    section.style.display = 'block';
                    section.style.top = section.dataset.originalTop; // Restore original position
                    button.innerText = `SF helper ${version} ▲`;
                } else {
                    section.style.display = 'none';
                    button.innerText = `SF helper ${version} ▲`;
                    removeOverlay();
                }
            });
            button.appendChild(linkIcon); // Re-append the link icon
        });
        return button;
    }

    function makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        element.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            // Close any open modal
            closeExistingModal();
            // Get the mouse cursor position at startup
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            // Calculate the new cursor position
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            // Set the element's new position with limits
            const newTop = Math.max(0, Math.min(window.innerHeight - element.offsetHeight, element.offsetTop - pos2));
            const newLeft = Math.max(0, Math.min(window.innerWidth - element.offsetWidth, element.offsetLeft - pos1));

            const sections = ['section1', 'section2', 'section3'];
            sections.forEach(id => {
                const section = document.getElementById(id);
                section.style.top = newTop + "px";
                section.style.left = newLeft + "px";
            });

            element.style.top = newTop + "px";
            element.style.left = newLeft + "px";
        }

        function closeDragElement() {
            // Stop moving when mouse button is released
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    // Function to view the saved cases info

    function viewCaseLog() {
        closeExistingModal(); // Close any existing modal or shift section
    
        const caseLog = JSON.parse(localStorage.getItem('sfCaseLog')) || [];
    
        // Calculate counts from the local storage
        const caseTypeCounts = {};
        caseTypes.forEach((value) => {
            caseTypeCounts[value] = caseLog.filter(entry => entry.caseOwner === value).length;
        });
    
        // Clear existing modal if present
        const existingModal = document.getElementById('custom-modal');
        if (existingModal) {
            existingModal.remove();
        }
    
        const modal = createModal(); // Reuse your existing modal creation function
    
        // Add total counts
        const totalCasesDiv = document.createElement('div');
        totalCasesDiv.style.cssText = 'margin-bottom: 10px; font-weight: bold;';
        totalCasesDiv.innerText = Object.entries(caseTypeCounts)
            .map(([type, count]) => `${type}: ${count}`)
            .join(' | ') + ` | Total: ${caseLog.length}`;
        modal.appendChild(totalCasesDiv);
    
        // Create table
        const table = document.createElement('table');
        table.style.cssText = `
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 14px;
        `;
        table.innerHTML = `
            <thead>
                <tr style="background-color: #f2f2f2; text-align: left;">
                    <th style="padding: 8px; border: 1px solid #ccc;">Case Number</th>
                    <th style="padding: 8px; border: 1px solid #ccc;">Case Type</th>
                    <th style="padding: 8px; border: 1px solid #ccc;">Time</th>
                    <th style="padding: 8px; border: 1px solid #ccc;">Action</th>
                </tr>
            </thead>
            <tbody id="case-log-body"></tbody>
        `;
        modal.appendChild(table);
    
        // Populate table body
        const tbody = document.getElementById('case-log-body');
        caseLog.slice().reverse().forEach((entry, index) => {
            const actualIndex = caseLog.length - 1 - index; // Adjust index for the original array
    
            const row = document.createElement('tr');
            row.style.cssText = 'border: 1px solid #ccc;';
    
            row.innerHTML = `
                <td style="padding: 8px; border: 1px solid #ccc;">${entry.caseNumber}</td>
                <td style="padding: 8px; border: 1px solid #ccc;">
                    <select class="case-type-dropdown" data-index="${actualIndex}" style="width: 150px;">
                        ${generateCaseTypeOptions(entry.caseOwner)}
                    </select>
                </td>
                <td style="padding: 8px; border: 1px solid #ccc;">${new Date(entry.timestamp).toLocaleString()}</td>
                <td style="padding: 8px; border: 1px solid #ccc;">
                    <button style="
                        background: red;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        padding: 5px 10px;
                        cursor: pointer;
                    ">Delete</button>
                </td>
            `;
    
            const deleteButton = row.querySelector('button');
            deleteButton.addEventListener('click', () => {
                deleteCaseLog(actualIndex); // Correctly call the delete function
                viewCaseLog(); // Refresh the table
            });
    
            tbody.appendChild(row);
        });
    
        // Add event listener for dropdown changes
        document.querySelectorAll('.case-type-dropdown').forEach(dropdown => {
            dropdown.addEventListener('change', (event) => {
                const index = event.target.getAttribute('data-index');
                const newCaseOwner = event.target.value;
                updateCaseOwner(index, newCaseOwner);
            });
        });
    
        // Add buttons (Clear Log, Copy Cases, Download Log)
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
        `;
    
        const clearButton = document.createElement('button');
        clearButton.innerText = 'Clear Log';
        clearButton.style.cssText = `
            background: red;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 10px;
            cursor: pointer;
            margin-right: 10px;
        `;
        clearButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to remove all the stored cases?')) {
                localStorage.removeItem('sfCaseLog');
                console.log('Log cleared.');
                modal.remove(); // Close the modal
                removeOverlay();
            }
        });
        buttonContainer.appendChild(clearButton);
    
        const copyButton = document.createElement('button');
        copyButton.innerText = 'Copy Case Numbers';
        copyButton.style.cssText = `
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 10px;
            cursor: pointer;
            margin-right: 10px;
        `;
        copyButton.addEventListener('click', () => {
            // Group cases by Case Type
            const groupedCases = caseLog.reduce((acc, entry) => {
                const caseType = caseTypes.get(entry.caseOwner) || entry.caseOwner;
                if (!acc[caseType]) acc[caseType] = [];
                acc[caseType].push(entry.caseNumber);
                return acc;
            }, {});
    
            // Format the grouped cases for clipboard
            const clipboardText = Object.entries(groupedCases)
                .map(([type, cases]) => `${type}: ${cases.join(', ')}`)
                .join('\n');
    
            navigator.clipboard.writeText(clipboardText).then(() => {
                console.log('Copied to clipboard:', clipboardText);
                alert('Case numbers copied to clipboard!');
            });
        });
        buttonContainer.appendChild(copyButton);
    
        const downloadButton = document.createElement('button');
        downloadButton.innerText = 'Download Log as .txt';
        downloadButton.style.cssText = `
            background: #28a745;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 10px;
            cursor: pointer;
            margin-right: 10px;
        `;
        downloadButton.addEventListener('click', () => {
            const logText = caseLog
                .map((entry) =>
                    `Case Number: ${entry.caseNumber}\nCase Type: ${entry.caseOwner}\nTime: ${new Date(entry.timestamp).toLocaleString()}`
                )
                .join('\n\n');
            const blob = new Blob([logText], { type: 'text/plain' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'case_log.txt';
            link.click();
        });
        buttonContainer.appendChild(downloadButton);
    
        const addCaseButton = document.createElement('button');
        addCaseButton.innerText = 'Add Case';
        addCaseButton.style.cssText = `
            background: #28a745;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 10px;
            cursor: pointer;
        `;
        addCaseButton.addEventListener('click', () => {
            addNewCaseRow(tbody);
        });
        buttonContainer.appendChild(addCaseButton);
    
        modal.appendChild(buttonContainer);
    
        document.body.appendChild(modal);
    }
    
    function addNewCaseRow(tbody) {
        const row = document.createElement('tr');
        row.style.cssText = 'border: 1px solid #ccc;';
    
        row.innerHTML = `
            <td style="padding: 8px; border: 1px solid #ccc;">
                <input type="number" class="new-case-number" style="width: 100%;">
            </td>
            <td style="padding: 8px; border: 1px solid #ccc;">
                <select class="new-case-type" style="width: 100%;">
                    ${generateCaseTypeOptions('')}
                </select>
            </td>
            <td style="padding: 8px; border: 1px solid #ccc;">
                ${new Date().toLocaleString()}
            </td>
            <td style="padding: 8px; border: 1px solid #ccc;">
                <button class="save-case-button" style="
                    background: #007bff;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    padding: 5px 10px;
                    cursor: pointer;
                ">Save</button>
            </td>
        `;
    
        const saveButton = row.querySelector('.save-case-button');
        saveButton.addEventListener('click', () => {
            const newRows = tbody.querySelectorAll('tr');
            newRows.forEach(newRow => {
                const caseNumberInput = newRow.querySelector('.new-case-number');
                const caseTypeSelect = newRow.querySelector('.new-case-type');
    
                if (caseNumberInput && caseTypeSelect) {
                    const caseNumber = caseNumberInput.value.trim();
                    const caseType = caseTypeSelect.value;
    
                    if (caseNumber && caseType) {
                        logCaseNumber(caseNumber, caseType);
                    }
                }
            });
            viewCaseLog(); // Refresh the table
        });
    
        tbody.appendChild(row);
    }
    
    // Function to generate case type options, ensuring no repeated values
    function generateCaseTypeOptions(selectedValue) {
        const seenValues = new Set();
        return Array.from(caseTypes.values()).filter(value => {
            if (seenValues.has(value)) {
                return false;
            } else {
                seenValues.add(value);
                return true;
            }
        }).map(value => `
            <option value="${value}" ${selectedValue === value ? 'selected' : ''}>${value}</option>
        `).join('');
    }

    // Function to update the case owner in the log
    function updateCaseOwner(index, newCaseOwner) {
        const caseLog = JSON.parse(localStorage.getItem('sfCaseLog')) || [];
        caseLog[index].caseOwner = newCaseOwner;
        localStorage.setItem('sfCaseLog', JSON.stringify(caseLog));
        console.log(`Updated case owner for case at index ${index} to ${newCaseOwner}`);
    }

    // Function to update the case owner in the log
    function updateCaseOwner(index, newCaseOwner) {
        const caseLog = JSON.parse(localStorage.getItem('sfCaseLog')) || [];
        caseLog[index].caseOwner = newCaseOwner;
        localStorage.setItem('sfCaseLog', JSON.stringify(caseLog));
        console.log(`Updated case owner for case at index ${index} to ${newCaseOwner}`);
    }

    // Prevent duplicates when logging a case
    function logCaseNumber(caseNumber, caseOwner) {
        const caseLog = JSON.parse(localStorage.getItem('sfCaseLog')) || [];

        // Check for duplicates
        if (caseLog.some((entry) => entry.caseNumber === caseNumber)) {
            console.log(`Case ${caseNumber} is already logged. Skipping.`);
            return;
        }

        // Add the new case to the log with a timestamp and case owner
        caseLog.push({
            caseNumber,
            caseOwner,
            timestamp: new Date().toISOString(),
        });

        localStorage.setItem('sfCaseLog', JSON.stringify(caseLog));
        console.log(`Logged case: ${caseNumber} with owner: ${caseOwner}`);
    }

    // Add buttons to the modal (Clear Log, Copy Cases, Download Log)
    function addLogButtons(modal, caseLog) {
        // Clear Log Button
        const clearButton = document.createElement('button');
        clearButton.innerText = 'Clear Log';
        clearButton.style.cssText = `
            margin-top: 20px;
            background: red;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 10px;
            cursor: pointer;
            display: block;
            width: 100%;
        `;
        clearButton.addEventListener('click', () => {
            localStorage.removeItem('sfCaseLog');
            console.log('Log cleared.');
            modal.remove(); // Close the modal
        });
        modal.appendChild(clearButton);

        // Copy Cases Button
        const copyButton = document.createElement('button');
        copyButton.innerText = 'Copy Case Numbers';
        copyButton.style.cssText = `
            margin-top: 10px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 10px;
            cursor: pointer;
            display: block;
            width: 100%;
        `;
        copyButton.addEventListener('click', () => {
            // Group cases by Case Type
            const groupedCases = caseLog.reduce((acc, entry) => {
                const caseType = caseTypes.get(entry.caseOwner) || entry.caseOwner;
                if (!acc[caseType]) acc[caseType] = [];
                acc[caseType].push(entry.caseNumber);
                return acc;
            }, {});
        
            // Format the grouped cases for clipboard
            const clipboardText = Object.entries(groupedCases)
                .map(([type, cases]) => `${type}: ${cases.join(', ')}`)
                .join('\n');
        
            navigator.clipboard.writeText(clipboardText).then(() => {
                console.log('Copied to clipboard:', clipboardText);
                alert('Case numbers copied to clipboard!');
            });
        });
        modal.appendChild(copyButton);

        // Download Log Button
        const downloadButton = document.createElement('button');
        downloadButton.innerText = 'Download Log as .txt';
        downloadButton.style.cssText = `
            margin-top: 10px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 10px;
            cursor: pointer;
            display: block;
            width: 100%;
        `;
        downloadButton.addEventListener('click', () => {
            const logText = caseLog
                .map((entry) =>
                    `Case Number: ${entry.caseNumber}\nCase Type: ${entry.caseOwner}\nTime: ${new Date(entry.timestamp).toLocaleString()}`
                )
                .join('\n\n');
            const blob = new Blob([logText], { type: 'text/plain' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'case_log.txt';
            link.click();
        });
        modal.appendChild(downloadButton);
    }

    // Add a delete function
    function deleteCaseLog(index) {
        const caseLog = JSON.parse(localStorage.getItem('sfCaseLog')) || [];
        caseLog.splice(index, 1); // Remove the specific entry
        localStorage.setItem('sfCaseLog', JSON.stringify(caseLog));
        console.log(`Deleted case at index: ${index}`);
    }

    function assignCaseToMe(caseId) {
        const caseNumber = getCaseNumber();
        const assignUrl = `https://epicgames--c.vf.force.com/apex/AssignToMePage?id=${caseId}`;
        const caseOwner = getCaseOwner(); // Use the updated function

        fetch(assignUrl, { method: 'GET', mode: 'no-cors', credentials: 'include' })
            .then(() => {
                console.log('Case assigned successfully.');

                if (caseNumber) {
                    logCaseNumber(caseNumber, caseOwner); // Log case owner
                } else {
                    console.error('Failed to retrieve the case number for logging.');
                }

                setTimeout(() => {
                    location.reload(); // Refresh the page after 1 second
                }, 1000);
            })
            .catch((error) => {
                console.error('Error assigning case:', error);
                alert('Error occurred while assigning the case.');
            });
    }

    //Function for get-info button

    function extractUnityInfo(sectionElement) {
        console.log('Starting Unity info extraction...');
        
        // Find the Unity section by looking for the span with the Unity content
        const allSpans = getAllShadowElements(sectionElement, 'span[part="formatted-rich-text"]');
        console.log('Found spans:', allSpans);
    
        let unityInfo = null;
    
        for (const span of allSpans) {
            console.log('Checking span:', span);
            
            // Check if this span contains Unity content by looking at its innerHTML
            if (span.innerHTML.includes('Unity Game Engine Format')) {
                console.log('Unity section found in span:', span);
    
                // Create a temporary div to parse the HTML content
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = span.innerHTML;
    
                // Extract Product URL
                const productUrlMatch = span.innerHTML.match(/Product Url:<\/b>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/);
                console.log('Product URL match:', productUrlMatch);
    
                // Extract Dependencies
                const dependenciesMatch = span.innerHTML.match(/Contains Package Dependencies:<\/b>\s*([^<]*)</);
                console.log('Dependencies match:', dependenciesMatch);
    
                // Extract Package Dependencies
                const packageDepsMatch = span.innerHTML.match(/Package Dependencies:<\/b>\s*([^<]*)</);
                console.log('Package Dependencies match:', packageDepsMatch);
    
                unityInfo = {
                    productUrl: productUrlMatch ? {
                        text: productUrlMatch[2],
                        href: productUrlMatch[1]
                    } : null,
                    containsDependencies: dependenciesMatch ? dependenciesMatch[1].trim() : '',
                    packageDependencies: packageDepsMatch ? packageDepsMatch[1].trim() : ''
                };
    
                console.log('Extracted Unity Info:', unityInfo);
                break;
            }
        }
    
        return unityInfo;
    }

    function processListingContent() {
        closeExistingModal();
        const caseNumber = getCaseNumber();
    
        if (!caseNumber) {
            console.error('Case Number not found.');
            alert('Case Number not found.');
            return [];
        }
    
        const tabElement = document.querySelector(`a[title^="${caseNumber}"]`);
        if (!tabElement) {
            console.error('Tab element not found.');
            alert('Tab element not found.');
            return [];
        }
    
        const ariaControls = tabElement.getAttribute('aria-controls');
        if (!ariaControls) {
            console.error('aria-controls attribute not found.');
            alert('aria-controls attribute not found.');
            return [];
        }
    
        const sectionElement = document.getElementById(ariaControls);
        if (!sectionElement) {
            console.error('Section element not found.');
            alert('Section element not found.');
            return [];
        }
    
        const spans = getAllShadowElements(sectionElement, 'span.test-id__section-header-title');
        const listingSpan = Array.from(spans).find((span) => span.textContent.trim() === 'Listing Content');
    
        if (!listingSpan) {
            console.error("Could not find the 'Listing Content' section.");
            alert("Could not find the 'Listing Content' section, you must be in a New Submission or Update case to use this.");
            return [];
        }
    
        const listingSection = listingSpan.closest('section');
        if (!listingSection) {
            console.error("'Listing Content' section found, but no parent section found.");
            alert("'Listing Content' section found, but no parent section found.");
            return [];
        }
    
        const rows = listingSection.querySelectorAll('table tr');
        let info = [];
        
        if (rows.length > 0) {
            info = Array.from(rows).slice(1).map((row) => {
                const cells = row.querySelectorAll('td');
                return {
                    appName: cells[0]?.textContent.trim() || 'N/A',
                    engineVersion: cells[2]?.textContent.trim() || 'N/A',
                    targetPlatforms: cells[3]?.textContent.trim() || 'N/A',
                    versionNotes: cells[4]?.textContent.trim() || 'N/A',
                    downloadLink: cells[5]?.querySelector('a')?.href || 'N/A',
                    isNewOrChanged: cells[6]?.textContent.trim() || 'N/A',
                };
            });
        }
    
        const paragraphs = getAllShadowElements(sectionElement, 'p');
        const distributionMethodParagraph = paragraphs.find((p) => p.textContent.includes('Distribution Method:'));
        const distributionMethod = distributionMethodParagraph?.textContent.replace('Distribution Method:', '').trim() || 'No Distribution Method found.';
    
        const opsReviewParagraph = paragraphs.find((p) => p.textContent.includes('Ops Review required'));
        const opsReviewText = opsReviewParagraph?.textContent.trim() || 'No Ops Review information found.';
    
        displayInfoInModal(distributionMethod, info, opsReviewText, getCaseOwner());
    }

    async function displayInfoInModal(distributionMethod, info, opsReviewText, caseOwner) {
        const modal = createModal();
        modal.style.cssText = `
            position: fixed;
            top: 100px;
            right: 200px;
            width: 950px;
            max-height: 80vh;
            background: white;
            border: 2px solid #ccc;
            border-radius: 10px;
            padding: 15px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            z-index: 10001;
            overflow-y: auto;
        `;
    
        const modalContent = document.createElement('div');
        modalContent.style.cssText = 'margin-top: 20px;';
        
        // Get case number and status
        const caseNumber = getCaseNumber();
        console.log('Case Number:', caseNumber);
    
        // Find the aria-controls value associated with the active tab
        const tabElement = document.querySelector(`a[title^="${caseNumber}"]`);
        let isCancelled = false;
        let colorSquare = '';

         // Check for seller status colors
         const ariaControls = tabElement.getAttribute('aria-controls');
         const sectionElement = document.getElementById(ariaControls);
         const greenImg = findElementByAttribute(sectionElement, 'img', 'src', '/img/samples/color_green.gif');
         const cyanImg = findElementByAttribute(sectionElement, 'img', 'src', '/servlet/servlet.FileDownload?file=0151a000002OTAA');
         const yellowImg = findElementByAttribute(sectionElement, 'img', 'src', '/img/samples/color_yellow.gif');
         
        if (tabElement) {
            
            if (ariaControls) {
                
                if (sectionElement) {
                    // Check for cancelled status
                    isCancelled = findTextInShadow(sectionElement, 'Cancelled') !== null;
                    
                   
                    
                    if (greenImg.length > 0) {
                        colorSquare = '<span style="display: inline-block; width: 20px; height: 20px; background-color: green !important; margin-right: 5px; margin-bottom: -3px !important;" title="Green Seller"></span>';
                    } else if (cyanImg.length > 0) {
                        colorSquare = '<span style="display: inline-block; width: 20px; height: 20px; background-color: cyan !important; margin-right: 5px; margin-bottom: -3px !important;" title="Blue Seller"></span>';
                    } else if (yellowImg.length > 0) {
                        colorSquare = '<span style="display: inline-block; width: 20px; height: 20px; background-color: #fcca03 !important; margin-right: 5px; margin-bottom: -3px !important;" title="Yellow Seller"></span>';
                    }
                }
            }
        }
    
        // Header Section with Case Information
        const headerSection = document.createElement('div');
        headerSection.style.cssText = `
            padding: 15px 15px 5px 15px; /* Top, Right, Bottom, Left */
            margin-bottom: 0;
            background: #f8f9fa;
        `;

        // Case title (initially without FAB Preview link)
        const caseTitle = document.createElement('div');
        caseTitle.style.cssText = 'font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 15px;';
        caseTitle.innerHTML = `
            ${colorSquare}${caseOwner} | ${caseNumber}
            ${isCancelled ? ' | <span style="color: red !important; font-weight: bold;">CANCELLED</span>' : ''}
        `;
        headerSection.appendChild(caseTitle);

        // Create table for Distribution Method and Ops Review
        const caseInfo = document.createElement('table');
        caseInfo.style.cssText = `
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin-bottom: 10px;
        `;

        // Create table row
        const row = document.createElement('tr');

        // Distribution Method cell (30% width)
        const distributionCell = document.createElement('td');
        distributionCell.style.cssText = `
            width: 30%;
            padding: 10px;
            border: 1px solid #e0e0e0;
            vertical-align: top;
        `;
        distributionCell.innerHTML = `
            <strong>Distribution Method:</strong>
            <div style="margin-top: 5px;">${distributionMethod}</div>
        `;

        // Ops Review cell (70% width)
        const opsReviewCell = document.createElement('td');
        opsReviewCell.style.cssText = `
            width: 70%;
            padding: 10px;
            border: 1px solid #e0e0e0;
            vertical-align: top;
        `;
        opsReviewCell.innerHTML = `
            <strong>Ops Review Information:</strong>
            <div style="margin-top: 5px; word-wrap: break-word; overflow-wrap: break-word;">${opsReviewText}</div>
        `;

        row.appendChild(distributionCell);
        row.appendChild(opsReviewCell);
        caseInfo.appendChild(row);
        headerSection.appendChild(caseInfo);

        // Check for SBP seller
        let isSBP = false;
        if (sectionElement) {
            const sbpElements = getAllShadowElements(sectionElement, 'records-record-layout-item[field-label="Marketplace SBP"]');
            sbpElements.forEach((item) => {
                const checkboxes = getAllShadowElements(item, 'input[type="checkbox"]');
                checkboxes.forEach((checkbox) => {
                    if (checkbox.checked) {
                        isSBP = true;
                    }
                });
            });
        }

        // Add warning message if either condition is met
        // Note: We can use cyanImg here because it's already defined in the outer scope
        if ((cyanImg && cyanImg.length > 0) || isSBP) {
            const warningDiv = document.createElement('div');
            warningDiv.style.cssText = `
                background-color: #fff3cd;
                border: 1px solid #ffeeba;
                color: #856404;
                padding: 15px;
                margin-top: 10px;
                border-radius: 4px;
            `;

            if (cyanImg && cyanImg.length > 0) {
                warningDiv.innerHTML = 'This is a seller with a Blue Warning indicator, please follow the current procedure before Changes Needing';
            }
            
            if (isSBP) {
                warningDiv.innerHTML = 'This is a SBP seller (<a href="https://confluence.it.epicgames.com/display/EMP/Adding+Strategic+Business+Partner+Content" target="_blank" style="color: #856404; text-decoration: underline;">Strategic Business Partner</a>) please confirm with a Lead or with Epic before Changes Needing this product';
            }

            headerSection.appendChild(warningDiv);
        }

        modalContent.appendChild(headerSection);
    
        // Check for Unity product and display info if found
        console.log('Checking for Unity product...');
        console.log('Ops Review Text:', opsReviewText);
        if (opsReviewText.includes("Unity Engine format found")) {  // Changed to includes() for more flexibility
            console.log('Unity product detected, extracting info...');
            const unityInfo = extractUnityInfo(sectionElement);
            console.log('Extracted Unity Info:', unityInfo);

            if (unityInfo) {
                console.log('Creating Unity section with info:', unityInfo);
                const unitySection = document.createElement('div');
                unitySection.style.cssText = `
                    padding: 15px;
                    background: #f8f9fa;
                    margin: 20px 0;
                    border: 1px solid #e0e0e0;
                    border-radius: 5px;
                `;

                const unityTitle = document.createElement('h3');
                unityTitle.textContent = 'Unity Format:';
                unityTitle.style.cssText = `
                    margin: 0 0 15px 0;
                    font-size: 18px;
                    font-weight: bold;
                `;
                unitySection.appendChild(unityTitle);

                const unityContent = document.createElement('div');
                unityContent.style.cssText = 'line-height: 1.5;';
                
                // Only show elements that exist
                const contentHTML = [];
                
                if (unityInfo.productUrl) {
                    contentHTML.push(`<p><strong>Product Url:</strong> <a href="${unityInfo.productUrl.href}" target="_blank" style="color: #007bff; text-decoration: none;">${unityInfo.productUrl.text}</a></p>`);
                }
                
                if (unityInfo.containsDependencies) {
                    contentHTML.push(`<p><strong>Contains Package Dependencies:</strong> ${unityInfo.containsDependencies}</p>`);
                }
                
                if (unityInfo.packageDependencies) {
                    contentHTML.push(`<p><strong>Package Dependencies:</strong> ${unityInfo.packageDependencies}</p>`);
                }
                
                unityContent.innerHTML = contentHTML.join('');
                unitySection.appendChild(unityContent);

                console.log('Unity section created:', unitySection);
                modalContent.appendChild(unitySection);
            } else {
                console.log('Unity info extraction failed');
            }
        } else {
            console.log('Not a Unity product');
        }

        // Filter Section
        const filterSection = document.createElement('div');
        filterSection.style.cssText = `
            padding: 15px;
            background: #f8f9fa;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
    
        const countDisplay = document.createElement('div');
        countDisplay.style.cssText = 'font-size: 14px;';
    
        const checkboxContainer = document.createElement('div');
        checkboxContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'showAllApps';
        checkbox.style.cursor = 'pointer';
        
        const label = document.createElement('label');
        label.htmlFor = 'showAllApps';
        label.textContent = 'Show apps with "NO"';
        label.style.cssText = 'cursor: pointer; user-select: none;';
    
        checkboxContainer.appendChild(checkbox);
        checkboxContainer.appendChild(label);
        
        filterSection.appendChild(countDisplay);
        filterSection.appendChild(checkboxContainer);
        modalContent.appendChild(filterSection);
    
        // Accordion Panels Container
        const accordionContainer = document.createElement('div');
        accordionContainer.style.cssText = 'padding: 0 15px;';
    
        // Function to update displayed panels and count
        function updateDisplay() {
            const showAll = checkbox.checked;
            
            // Clear existing panels
            accordionContainer.innerHTML = '';
            
            // Filter and create panels
            const visibleItems = info.filter(item => showAll || item.isNewOrChanged === 'YES');
            
            visibleItems.forEach((item, index) => {
                const panel = createAccordionPanel(item, index, distributionMethod);
                accordionContainer.appendChild(panel);
            });
    
            // Update count display
            countDisplay.innerHTML = `
            <span style="font-size: 18px; font-weight: bold;">UE Format:</span> 
            Total app names with ${showAll ? '"YES" & "NO"' : '"YES"'}: 
            <span style="font-weight: bold;">${visibleItems.length}</span>
            `;

        }
    
        // Initial display
        updateDisplay();
    
        // Add checkbox event listener
        checkbox.addEventListener('change', updateDisplay);
    
        // Initial count update
        updateDisplay();
    
        modalContent.appendChild(accordionContainer);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
    
        // Fetch FAB URL asynchronously and update the title when available
        getFabURL(caseNumber).then(fabURL => {
            if (fabURL) {
                // Get the Django URL from the text node we found earlier
                const searchText = "https://fab-admin.daec.live.use1a.on.epicgames.com/admin/listings/listing/";
                const node = findTextInShadowDOM(sectionElement, searchText);
                const djangoURL = node ? node.textContent.trim() : null;
        
                if (djangoURL) {
                    const links = ` | <a href="${djangoURL}" target="_blank" style="color: #007bff; text-decoration: none;">Django Link</a> | <a href="${fabURL}" target="_blank" style="color: #007bff; text-decoration: none;">FAB Preview</a>`;
                    
                    caseTitle.innerHTML = `
                        ${colorSquare}${caseOwner} | ${caseNumber}
                        ${isCancelled ? ' | <span style="color: red !important; font-weight: bold;">CANCELLED</span>' : ''}
                        ${links}
                    `;
                }
            }
        }).catch(error => {
            console.error('Error getting FAB URL:', error);
        });
    }
    
    function createAccordionPanel(item, index, distributionMethod) {
        // Outer panel with overflow visible
        const panel = document.createElement('div');
        panel.className = 'accordion-panel';
        panel.style.cssText = `
            margin-bottom: 10px;
            overflow: visible;
        `;
    
        // Inner panel with rounded corners
        const innerPanel = document.createElement('div');
        innerPanel.style.cssText = `
            border-radius: 5px;
            background: ${item.isNewOrChanged === 'NO' ? '#fff3e0' : 'white'};
            overflow: visible;
        `;
    
        const earliestVersion = getEarliestUEVersion(item.engineVersion);
        const versions = item.engineVersion.split(';');
        const additionalVersions = versions.length - 1;
        const targetPlatforms = getTargetPlatforms(item.targetPlatforms);
    
        // Combined Info and Action Bar
        const combinedBar = document.createElement('div');
        combinedBar.style.cssText = `
            padding: 15px;
            cursor: pointer;
            display: flex;
            align-items: center;
            background: ${item.isNewOrChanged === 'NO' ? '#FFD9B3' : '#f8f9fa'};
            justify-content: space-between;
            border: 1px solid #ddd;
            border-radius: 5px;
            margin-bottom: -1px;
            position: relative;
            z-index: 1;
        `;
    
        // Create clickable app name container
        const appNameContainer = document.createElement('div');
        appNameContainer.style.cssText = `
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 4px 8px;
            cursor: pointer;
            transition: background-color 0.2s;
            background: white;
        `;
        appNameContainer.innerHTML = `<strong style="font-size: 16px;">${item.appName}</strong>`;
    
        // Create notification for app name using updated function
        const appNameWithNotification = createCopyNotification(appNameContainer);
        appNameContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(item.appName).then(() => {
                appNameWithNotification.show();
            });
        });
    
        // Create the main info container
        const infoContainer = document.createElement('div');
        infoContainer.style.cssText = 'flex-grow: 1; display: flex; align-items: center; gap: 15px; margin-left: 15px;';
        infoContainer.innerHTML = `
            <span>UE Version:<br>   ${earliestVersion}${additionalVersions > 0 ? ` (+${additionalVersions})` : ''}</span>
            <span style="color: #666;">|</span>
            <span>${targetPlatforms.join(', ')}</span>
            <span style="color: #666;">|</span>
            <span>${createDownloadLinks(item.downloadLink)}</span>
        `;
    
        // Action buttons container
        const actionContainer = document.createElement('div');
        actionContainer.style.cssText = 'display: flex; gap: 10px; align-items: center;';
    
        // P4V data button
        const p4vButton = document.createElement('button');
        p4vButton.innerText = 'P4V data';
        p4vButton.style.cssText = `
            background: #ff9800;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 14px;
        `;
    
        // Create notification for P4V button using updated function
        const p4vWithNotification = createCopyNotification(p4vButton);
        p4vButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const p4vData = {
                earliestUEVersion: earliestVersion,
                distributionMethod: distributionMethod,
                appName: item.appName,
                SFcase: getCaseNumber(),
                caseType: getCaseOwner()
            };
            navigator.clipboard.writeText(JSON.stringify(p4vData, null, 2)).then(() => {
                p4vWithNotification.show();
            });
        });
        actionContainer.appendChild(p4vWithNotification.wrapper);
    
        // Horde button
        const hordeButton = document.createElement('button');
        hordeButton.innerText = 'Horde';
        hordeButton.style.cssText = `
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 14px;
        `;
        hordeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const appData = getHordeAppData(item.appName);
            sendHordeAppData(appData);
        });
        actionContainer.appendChild(hordeButton);
    
        // Expand indicator
        const expandIndicator = document.createElement('div');
        expandIndicator.style.cssText = 'margin-left: 10px;';
        expandIndicator.innerHTML = '<span class="expand-indicator" style="font-size: 20px; color: #666;">▼</span>';
    
        // Details Panel wrapper
        const detailsPanelWrapper = document.createElement('div');
        detailsPanelWrapper.style.cssText = `
            overflow: hidden;
            border: none;
            border-radius: 5px;
            background: ${item.isNewOrChanged === 'NO' ? '#FFD9B3' : 'white'};
        `;
                    
        // Details Panel
        const detailsPanel = document.createElement('div');
        detailsPanel.style.cssText = `
            padding: 15px;
            display: none;
            background: transparent;
        `;
        detailsPanel.innerHTML = `
            <div style="margin-bottom: 10px;"><strong>Engine Version:</strong> ${item.engineVersion}</div>
            <div style="margin-bottom: 10px;"><strong>Target Platforms:</strong> ${item.targetPlatforms}</div>
            <div style="margin-bottom: 10px;"><strong>Version Notes:</strong> ${item.versionNotes}</div>
            <div><strong>Is New or Changed:</strong> ${item.isNewOrChanged}</div>
        `;
    
        if (item.isNewOrChanged === 'NO') {
            combinedBar.style.backgroundColor = "#FFD9B3";
            detailsPanelWrapper.style.backgroundColor = "#FFD9B3";
        }
    
        // Assemble the combined bar
        combinedBar.appendChild(appNameWithNotification.wrapper);
        combinedBar.appendChild(infoContainer);
        combinedBar.appendChild(actionContainer);
        combinedBar.appendChild(expandIndicator);
    
        // Wrap detailsPanel in its wrapper
        detailsPanelWrapper.appendChild(detailsPanel);
    
        // Append all sections to inner panel
        innerPanel.appendChild(combinedBar);
        innerPanel.appendChild(detailsPanelWrapper);
        
        // Append inner panel to outer panel
        panel.appendChild(innerPanel);
    
        // Add click handler for expansion
        panel.addEventListener('click', (e) => {
            if (!e.target.closest('button') && !e.target.closest('a') && !e.target.closest('[style*="border: 1px solid #ddd"]')) {
                const expandIndicator = panel.querySelector('.expand-indicator');
                const isExpanded = detailsPanel.style.display === 'block';
                
                detailsPanel.style.display = isExpanded ? 'none' : 'block';
                detailsPanelWrapper.style.border = isExpanded ? 'none' : '1px solid #ddd';
                expandIndicator.style.transform = `rotate(${isExpanded ? '0' : '180'}deg)`;
                expandIndicator.style.transition = 'transform 0.3s ease';
            }
        });
    
        return panel;
    }

    function getCaseIdFromURL() {
        return window.location.pathname.split('/')[4] || null;
    }

    function getCaseNumber() {
        const caseElement = document.querySelector('a[tabindex="0"] span.title.slds-truncate');
        if (caseElement) {
            const match = caseElement.textContent.trim().match(/^\d+/);
            return match ? match[0] : null;
        }
        return null;
    }

    function copyToClipboard(text, button) {
        navigator.clipboard.writeText(text).then(() => {
            const copiedLabel = document.createElement('span');
            copiedLabel.innerText = 'Copied';
            copiedLabel.style.cssText = `
                margin-left: 10px;
                color: green;
                font-weight: bold;
            `;
            button.parentElement.appendChild(copiedLabel);

            setTimeout(() => {
                copiedLabel.remove();
            }, 2000);
        });
    }

    function createCopyNotification(element) {
        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.classList.add('copy-notification-wrapper');
        wrapper.style.cssText = `
            position: relative;
            padding-top: 25px;
            margin-top: -25px;
            z-index: 1;
        `;
    
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(40, 167, 69, 0.9);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
            white-space: nowrap;
            z-index: 999999;
        `;
        notification.textContent = 'Copied!';
    
        // Add the notification to the wrapper
        wrapper.appendChild(notification);
        // Add the element to the wrapper
        wrapper.appendChild(element);
    
        return {
            wrapper: wrapper,
            show: () => {
                notification.style.opacity = '1';
                setTimeout(() => {
                    notification.style.opacity = '0';
                }, 1500);
            }
        };
    }

    function createModal() {
        const overlay = createOverlay();
        document.body.appendChild(overlay);
        const modal = document.createElement('div');
        modal.id = 'custom-modal';
        modal.className = 'keep-overlay';  // class to avoid closing the dark overlay when clicking any button in the script
        modal.style.cssText = `
            position: fixed;
            top: 20%;
            right: 200px;
            width: 600px;
            max-height: 80%;
            background: white;
            border: 2px solid #ccc;
            border-radius: 10px;
            padding: 15px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            z-index: 10001;
            overflow-y: auto;
        `;

        const closeButton = document.createElement('button');
        closeButton.innerText = 'Close';
        closeButton.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: red;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 5px 10px;
            cursor: pointer;
        `;
        closeButton.addEventListener('click', () => {
            modal.remove();
            removeOverlay();
        });

        modal.appendChild(closeButton);
        document.body.appendChild(modal);

        return modal;
    }

    // functions to close the modal used in initializeUI
    function closeExistingModal() {
        const existingModal = document.getElementById('custom-modal');
        const existingOverlay = document.getElementById('sf-helper-overlay');
        if (existingModal) {
            existingModal.remove();
            console.log('Existing modal closed.');
        }

        if (existingOverlay) {
            existingOverlay.remove();
            console.log('Overlay removed.');
        }

        const shiftSection = document.getElementById('shift-section');
        if (shiftSection) {
            shiftSection.remove();
            console.log('Shift section closed.');
        }
    }

    function observeURLChanges() {
        let currentURL = window.location.href;

        // Monitor for URL changes
        setInterval(() => {
            if (currentURL !== window.location.href) {
                currentURL = window.location.href;
                closeExistingModal(); // Close modal when URL changes
            }
        }, 500); // Check every 500ms
    }

    // Function to convert Google Drive links into direct download links

    function createDownloadLinks(downloadLink) {
        const isGoogleDriveLink = downloadLink.includes('drive.google.com/file/d/');
        if (isGoogleDriveLink) {
            // Extract the file ID from the Google Drive link
            const fileIdMatch = downloadLink.match(/\/d\/(.+?)\//);
            if (fileIdMatch) {
                const fileId = fileIdMatch[1];
                const directLink = `https://drive.google.com/uc?export=download&id=${fileId}`;
                return `
                    <a href="${downloadLink}" target="_blank"> Download Link</a><br>
                    <a href="${directLink}" target="_blank">Direct Link</a>
                `;
            }
        }
        // If it's not a Google Drive link, return only the normal link
        return `<a href="${downloadLink}" target="_blank">Download Link</a>`;
    }

    //Function to change the status of the SF Case
    function changeStatus(buttonId) {
        console.log('Starting approval process...');
    
        // First, get the current case number and locate the correct section
        const caseNumber = getCaseNumber();
        if (!caseNumber) {
            console.error('Case number not found');
            return;
        }
    
        // Find the aria-controls value associated with the active tab
        const tabElement = document.querySelector(`a[title^="${caseNumber}"]`);
        if (!tabElement) {
            console.error('Tab element not found');
            return;
        }
    
        const ariaControls = tabElement.getAttribute('aria-controls');
        if (!ariaControls) {
            console.error('aria-controls attribute not found');
            return;
        }
    
        // Locate the section element with the corresponding ID
        const sectionElement = document.getElementById(ariaControls);
        if (!sectionElement) {
            console.error('Section element not found');
            return;
        }
    
        // For decline button, get product title and show confirmation
        if (buttonId === 'decline-button') {
            const productTitleElement = sectionElement.querySelector('lightning-formatted-text[title]');
            if (!productTitleElement) {
                console.error('Product Title element not found.');
                return;
            }
            const productTitle = productTitleElement.getAttribute('title');
            
            if (!confirm(`Are you sure you want to Decline this product?\n\nProduct: ${productTitle}\nCase Number: ${caseNumber}`)) {
                return; // If user clicks Cancel, stop the function
            }
        }
    
        // Rest of the function remains the same...
        const editButtons = getAllShadowElements(sectionElement, 'button[title="Edit Status"]');
        const editButton = editButtons[0];
        
        if (editButton) {
            editButton.click();
    
            setTimeout(() => {
                const dropdownButtons = getAllShadowElements(sectionElement, 'button[aria-label="Status"]');
                const dropdownButton = dropdownButtons[0];
                
                if (dropdownButton) {
                    dropdownButton.click();
    
                    setTimeout(() => {
                        const dropdownItems = getAllShadowElements(sectionElement, 'lightning-base-combobox-item');
                        let approvalOption;
    
                        if (buttonId === 'approve-button') {
                            approvalOption = Array.from(dropdownItems).find(option =>
                                option.getAttribute('data-value') === 'Ops Review Complete - Approved'
                            );
                        } else if (buttonId === 'changes-needed-button') {
                            approvalOption = Array.from(dropdownItems).find(option =>
                                option.getAttribute('data-value') === 'Ops Review Complete - Changes Needed'
                            );
                        } else if (buttonId === 'decline-button') {
                            approvalOption = Array.from(dropdownItems).find(option =>
                                option.getAttribute('data-value') === 'Ops Review Complete - Rejected'
                            );
                        } else if (buttonId === 'close-button') {
                            approvalOption = Array.from(dropdownItems).find(option =>
                                option.getAttribute('data-value') === 'Closed'
                            );
                        }
    
                        if (approvalOption) {
                            approvalOption.click();
    
                            setTimeout(() => {
                                const saveButtons = getAllShadowElements(sectionElement, 'button[name="SaveEdit"]');
                                const saveButton = saveButtons[0];
                                if (saveButton) {
                                    saveButton.click();
                                    console.log('Status changed and changes saved.');
                                } else {
                                    console.error('Save button not found.');
                                }
                            }, 500);
                        } else {
                            console.error('Approval option not found.');
                        }
                    }, 500);
                } else {
                    console.error('Dropdown button not found.');
                }
            }, 1000);
        } else {
            console.error('Edit button not found.');
        }
    }

    // Function to get the case owner (case type)

    const caseTypes = new Map([
        ['Fab Submission Support New', 'NEW SUBMISSIONS'],
        ['Fab Submission Support Update', 'UPDATE'],
        ['FAB Support Queue', 'FAB SUPPORT'],
        ['FAB Seller Support', 'FAB SUPPORT'],
        // Add new case types here
    ]);

    function getCaseOwner() {
        const caseNumber = getCaseNumber();
        if (!caseNumber) {
            console.error('Case Number not found.');
            return '(Unknown Case Type)';
        }
    
        console.log('Case Number:', caseNumber);
    
        // Find the aria-controls value associated with the active tab
        const tabElement = document.querySelector(`a[title^="${caseNumber}"]`);
        if (!tabElement) {
            console.error('Tab element not found.');
            return '(Unknown Case Type)';
        }
    
        const ariaControls = tabElement.getAttribute('aria-controls');
        if (!ariaControls) {
            console.error('aria-controls attribute not found.');
            return '(Unknown Case Type)';
        }
    
        console.log('aria-controls:', ariaControls);
    
        // Locate the section element with the corresponding ID
        const sectionElement = document.getElementById(ariaControls);
        if (!sectionElement) {
            console.error('Section element not found.');
            return '(Unknown Case Type)';
        }
    
        console.log('Section element found:', sectionElement);
    
        // Retrieve the case owner directly from the section using getAllShadowElements
        const caseOwnerElements = getAllShadowElements(sectionElement, 'slot');
        let caseOwner = '(Unknown Case Type)';
    
        caseOwnerElements.forEach(element => {
            caseTypes.forEach((value, key) => {
                if (element.textContent.includes(key)) {
                    caseOwner = value;
                }
            });
        });
    
        if (caseOwner === '(Unknown Case Type)') {
            // If not found in slot elements, use findTextInShadow
            caseTypes.forEach((value, key) => {
                const foundNode = findTextInShadow(sectionElement, key);
                if (foundNode) {
                    caseOwner = value;
                }
            });
        }
    
        console.log('Case Owner:', caseOwner);
        return caseOwner;
    }

    function groupShifts(shifts) {
        if (shifts.length === 0) return [];
        
        // Sort shifts by start time
        shifts.sort((a, b) => new Date(a.start) - new Date(b.start));
    
        const groupedShifts = [];
        let currentShift = { ...shifts[0] };
    
        for (let i = 1; i < shifts.length; i++) {
            const shift = shifts[i];
            const currentEnd = new Date(currentShift.end);
            const nextStart = new Date(shift.start);
    
            // Check if shifts are back-to-back and have the same summary
            if (currentEnd.getTime() === nextStart.getTime() && currentShift.summary === shift.summary) {
                // Extend the current shift's end time and update the duration
                currentShift.end = shift.end;
                const durationHours = (new Date(currentShift.end) - new Date(currentShift.start)) / (1000 * 60 * 60);
                currentShift.duration = `${durationHours} hours`;
            } else {
                groupedShifts.push(currentShift);
                currentShift = { ...shift };
            }
        }
    
        // Push the last shift
        groupedShifts.push(currentShift);
    
        // Split shifts that cross PST midnight
        const splitShifts = [];
        for (const shift of groupedShifts) {
            // Create Date objects in PST
            const startUTC = new Date(shift.start);
            const endUTC = new Date(shift.end);
    
            // Convert to PST using explicit offset
            // PST is UTC-8 (standard time)
            const pstOffset = -8 * 60 * 60 * 1000; // -8 hours in milliseconds
            const startPST = new Date(startUTC.getTime() + startUTC.getTimezoneOffset() * 60 * 1000 + pstOffset);
            const endPST = new Date(endUTC.getTime() + endUTC.getTimezoneOffset() * 60 * 1000 + pstOffset);
    
            // Calculate PST midnight
            const midnightPST = new Date(startPST);
            midnightPST.setHours(24, 0, 0, 0);
    
            // Convert midnight PST back to local time for comparison
            const midnightLocal = new Date(midnightPST.getTime() - pstOffset - startUTC.getTimezoneOffset() * 60 * 1000);
    
            // Check if shift crosses PST midnight AND doesn't end exactly at midnight
            if (startPST.getDate() !== endPST.getDate() && 
                !(endPST.getHours() === 0 && endPST.getMinutes() === 0)) {
                
                // Split the shift at PST midnight
                splitShifts.push({
                    ...shift,
                    end: midnightLocal.toISOString(),
                    duration: `${(midnightLocal - startUTC) / (1000 * 60 * 60)} hours`
                });
    
                // Only create second shift if there's actual duration after midnight
                const remainingDuration = (endUTC - midnightLocal) / (1000 * 60 * 60);
                if (remainingDuration > 0) {
                    splitShifts.push({
                        ...shift,
                        start: midnightLocal.toISOString(),
                        duration: `${remainingDuration} hours`
                    });
                }
            } else {
                // No split needed
                splitShifts.push(shift);
            }
        }
    
        return splitShifts;
    }

    let displayedShifts = 4; // Number of shifts to display in the shift table

    async function displayShiftInfo() {
        closeExistingModal(); // Close any existing modal or shift section

        const overlay = createOverlay();
        document.body.appendChild(overlay);
    
        const tandaData = localStorage.getItem('parsedTandaScheduleData');
        if (!tandaData) return;
    
        const shifts = JSON.parse(tandaData);
        console.log('Parsed Shifts:', shifts); // Debugging log
    
        const groupedShifts = groupShifts(shifts);
        console.log('Grouped Shifts:', groupedShifts); // Debugging log
    
       
        const currentAndNextShifts = getCurrentAndNextShifts(groupedShifts, displayedShifts);
        console.log('Current / Next Shifts:', currentAndNextShifts); // Debugging log
    
        const now = new Date();
        const currentShiftIndex = currentAndNextShifts.findIndex(shift => new Date(shift.start) <= now && new Date(shift.end) >= now);
        const nextShiftIndex = currentAndNextShifts.findIndex(shift => new Date(shift.start) > now);
    
        let currentIndex = 0;
    
        const shiftSection = document.createElement('div');
        shiftSection.id = 'shift-section';
        shiftSection.className = 'keep-overlay';  // class to avoid closing the dark overlay when clicking any button in the script
        shiftSection.style.cssText = `
            position: fixed;
            top: 120px;
            right: 220px; /* Move 200px to the left */
            width: 600px; /* Set width to 600px */
            max-height: 80%; /* Set max height to 80% */
            overflow-y: auto; /* Enable vertical scrolling */
            border: 1px solid #ccc;
            border-radius: 5px;
            padding: 10px;
            background: white;
            z-index: 10000;
        `;
    
        const shiftInfo = document.createElement('div');
        shiftSection.appendChild(shiftInfo);
    
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
        `;
    
        const showMoreButton = document.createElement('button');
        showMoreButton.innerText = 'Show more';
        showMoreButton.style.cssText = `
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 5px 10px;
            cursor: pointer;
            margin-right: 10px;
        `;
        showMoreButton.addEventListener('click', () => {
            currentIndex += displayedShifts;
            renderShifts();
            showLessButton.style.display = 'block';
        });
        buttonContainer.appendChild(showMoreButton);
    
        const showLessButton = document.createElement('button');
        showLessButton.innerText = 'Show less';
        showLessButton.style.cssText = `
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 5px 10px;
            cursor: pointer;
            display: none; /* Initially hidden */
        `;
        showLessButton.addEventListener('click', () => {
            currentIndex = 0;
            renderShifts();
            showLessButton.style.display = 'none';
        });
        buttonContainer.appendChild(showLessButton);
    
        shiftSection.appendChild(buttonContainer);
    
        const closeButton = document.createElement('button');
        closeButton.innerText = 'Close';
        closeButton.style.cssText = `
            background: red;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 5px 10px;
            cursor: pointer;
            margin-top: 10px;
        `;
        closeButton.addEventListener('click', () => {
            shiftSection.remove();
            removeOverlay();
        });
        shiftSection.appendChild(closeButton);
    
        document.body.appendChild(shiftSection);
        

        // Create the "Update Shifts" button (Blue)
        const updateShiftsButton = createButton('Update Shifts', '#007bff', () => {
            showTandaModal();
        });
        updateShiftsButton.style.cssText += `
            position: absolute;
            top: 10px;
            right: 10px;
            width: 100px; /* Make the button smaller */
            padding: 2px; /* Adjust padding */
        `;
        shiftSection.appendChild(updateShiftsButton);

        // // Create the "Manual Add" button (Purple) - FOR TESTING ONLY
        //     const manualAddButton = createButton('Manual Add', '#6f42c1', () => {
        //         showModal('Please paste your shift data from iCal:', (tandaData) => {
        //             if (tandaData) {
        //                 const parsedEvents = parseEvents(tandaData);
        //                 localStorage.setItem('parsedTandaScheduleData', JSON.stringify(parsedEvents));
        //                 location.reload(); // Reload the page to update the shift info
        //             }
        //         });
        //     });
        //     manualAddButton.style.cssText += `
        //         position: absolute;
        //         top: 40px;  /* Position it below the Update Shifts button */
        //         right: 10px;
        //         width: 100px;
        //         padding: 2px;
        //     `;
        //     shiftSection.appendChild(manualAddButton);
    
        function renderShifts() {
            const shiftsToRender = currentAndNextShifts.slice(0, currentIndex + displayedShifts);
            console.log('Rendered Shifts:', shiftsToRender); // Debugging log
            shiftInfo.innerHTML = `
                <strong>Current / Next Shifts  | <a href="https://calendar.google.com/calendar/u/0/r?pli=1" target="_blank">Google Calendar</a> <br> Remember that the most updated source of your shifts is <br>the Workforce official App</strong><br>
                ${shiftsToRender.length > 0 ? formatShiftsTable(shiftsToRender, currentShiftIndex, nextShiftIndex) : 'No upcoming shifts'}
            `;
    
            
        }
    
        renderShifts(); // Initial render
    }

    function formatShiftsTable(shifts, currentShiftIndex, nextShiftIndex) {
        const table = document.createElement('table');
        table.style.cssText = `
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 14px;
        `;
        table.innerHTML = `
            <thead>
                <tr style="background-color: #f2f2f2; text-align: left;">
                    <th style="padding: 8px; border: 1px solid #ccc;">Role</th>
                    <th style="padding: 8px; border: 1px solid #ccc;">Start</th>
                    <th style="padding: 8px; border: 1px solid #ccc;">End</th>
                    <th style="padding: 8px; border: 1px solid #ccc;">Duration</th>
                    <th style="padding: 8px; border: 1px solid #ccc;">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${shifts.map((shift, index) => {
                    const isHighlighted = index === currentShiftIndex || (currentShiftIndex === -1 && index === nextShiftIndex);
                    return formatShiftRow(shift, isHighlighted, shifts, index);
                }).join('')}
            </tbody>
        `;
        return table.outerHTML;
    }

    function formatShiftRow(shift, isHighlighted, shifts, currentIndex) {
        const borderStyle = isHighlighted ? 'border: 2px solid yellow !important;' : 'border: 1px solid #ccc;';
        const rowHeight = '50px';
    
        // Check if this is part of a split shift by looking at adjacent shifts
        const nextShift = shifts[currentIndex + 1];
        const prevShift = shifts[currentIndex - 1];
        
        const isPartOfSplitShift = (nextShift && 
            new Date(shift.end).getTime() === new Date(nextShift.start).getTime() && 
            shift.summary === nextShift.summary) || 
            (prevShift && 
            new Date(shift.start).getTime() === new Date(prevShift.end).getTime() && 
            shift.summary === prevShift.summary);
    
        const isFirstPart = nextShift && 
            new Date(shift.end).getTime() === new Date(nextShift.start).getTime() && 
            shift.summary === nextShift.summary;
    
        const isSecondPart = prevShift && 
            new Date(shift.start).getTime() === new Date(prevShift.end).getTime() && 
            shift.summary === prevShift.summary;
    
        // Split shift styling
        const splitShiftStyle = isPartOfSplitShift ? `
            ${isFirstPart ? 'border-bottom: 2px dashed #007bff !important;' : ''}
            ${isSecondPart ? 'border-top: 2px dashed #007bff !important;' : ''}
            background: ${isFirstPart ? 'linear-gradient(to bottom, white 90%, #f0f8ff)' : 
                         isSecondPart ? 'linear-gradient(to top, white 90%, #f0f8ff)' : 'white'};
        ` : '';
    
        // Check if current or next shift for label
        const now = new Date();
        const start = new Date(shift.start);
        const end = new Date(shift.end);
        const isCurrent = start <= now && end >= now;
        const isNext = start > now;
        
        const labelHtml = isHighlighted ? `
            <div style="
                position: absolute;
                top: -10px;
                left: 10px;
                background-color: #FFA500;
                color: black;
                padding: 2px 8px;
                border-radius: 10px;
                font-size: 12px;
                font-weight: bold;
                z-index: 1;
            ">
                ${isCurrent ? 'Current' : 'Next'}
            </div>
        ` : '';
    
        // Add split shift indicator if applicable
        const splitShiftLabel = isPartOfSplitShift ? `
            <div style="
                position: absolute;
                top: ${isFirstPart ? 'auto' : '0'};
                bottom: ${isFirstPart ? '0' : 'auto'};
                right: 10px;
                color: #007bff;
                font-size: 11px;
                font-weight: bold;
            ">
                ${isFirstPart ? 'Part 1' : 'Part 2'}
            </div>
        ` : '';
    
        // Rest of the date formatting code remains the same
        const startPST = new Date(shift.start);
        const endPST = new Date(shift.end);
    
        // Format PST times
        const startTimePST = startPST.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'America/Los_Angeles'
        });
        const startDatePST = startPST.toLocaleDateString('en-US', {
            timeZone: 'America/Los_Angeles'
        });
        const endTimePST = endPST.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'America/Los_Angeles'
        });
        const endDatePST = endPST.toLocaleDateString('en-US', {
            timeZone: 'America/Los_Angeles'
        });
    
        // Convert to local time
        const startLocal = new Date(startPST);
        const endLocal = new Date(endPST);
    
        // Format local times
        const startTimeLocal = startLocal.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit'
        });
        const startDateLocal = startLocal.toLocaleDateString('en-US');
        const endTimeLocal = endLocal.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit'
        });
        const endDateLocal = endLocal.toLocaleDateString('en-US');
    
        return `
            <tr style="${borderStyle} height: ${rowHeight}; position: relative; ${splitShiftStyle}">
                <td style="padding: 8px; border: 1px solid #ccc; max-width: 200px; word-wrap: break-word; white-space: normal; position: relative;">
                    ${labelHtml}
                    ${shift.summary || 'No summary'}
                    ${splitShiftLabel}
                </td>
                <td style="padding: 8px; border: 1px solid #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <div><strong>PST:</strong> ${startTimePST}</div>
                    <div style="font-size: 12px;">${startDatePST}</div>
                    <div style="margin-top: 4px;"><strong>Local:</strong> ${startTimeLocal}</div>
                    <div style="font-size: 12px;">${startDateLocal}</div>
                </td>
                <td style="padding: 8px; border: 1px solid #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <div><strong>PST:</strong> ${endTimePST}</div>
                    <div style="font-size: 12px;">${endDatePST}</div>
                    <div style="margin-top: 4px;"><strong>Local:</strong> ${endTimeLocal}</div>
                    <div style="font-size: 12px;">${endDateLocal}</div>
                </td>
                <td style="padding: 8px; border: 1px solid #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${shift.duration}
                </td>
                <td style="padding: 8px; border: 1px solid #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <button class="shift-report-button" 
                            data-start="${shift.start}" 
                            data-end="${shift.end}" 
                            data-duration="${shift.duration}" 
                            style="
                                background: #007bff;
                                color: white;
                                border: none;
                                border-radius: 5px;
                                padding: 5px 10px;
                                cursor: pointer;
                            ">Shift Report</button>
                </td>
            </tr>
        `;
    }

        document.addEventListener('click', function(event) {
            if (event.target.classList.contains('shift-report-button')) {
                const start = event.target.getAttribute('data-start');
                const end = event.target.getAttribute('data-end');
                const duration = event.target.getAttribute('data-duration');
                showShiftReportModal(start, end, duration);
            }
        });


        function showShiftReportModal(start, end, duration) {
            closeExistingModal();
            const overlay = createOverlay();
            document.body.appendChild(overlay);

            const caseLog = JSON.parse(localStorage.getItem('sfCaseLog')) || [];
            const totalMinutes = Math.round((new Date(end) - new Date(start)) / (1000 * 60)); // Ensure integer minutes
        
            // Calculate counts and initialize multipliers
            const caseTypeCounts = {};
            const caseTypeMultipliers = {};
            caseTypes.forEach((value) => {
                caseTypeCounts[value] = caseLog.filter(entry => entry.caseOwner === value).length;
                caseTypeMultipliers[value] = value === 'NEW SUBMISSIONS' ? 1.5 : 1; // Default multiplier
            });
        
            const totalCases = Object.values(caseTypeCounts).reduce((sum, count) => sum + count, 0);
        
            const modal = document.createElement('div');
            modal.id = 'custom-modal';
            modal.className = 'keep-overlay';  // class to avoid closing the dark overlay when clicking any button in the script
            modal.style.cssText = `
                position: fixed;
                top: 20%;
                left: 50%;
                transform: translate(-50%, -20%);
                width: 50%;
                background: white;
                border: 2px solid yellow;
                border-radius: 10px;
                padding: 15px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                z-index: 10001;
            `;
        
            const closeButton = document.createElement('button');
            closeButton.innerText = 'Close';
            closeButton.style.cssText = `
                position: absolute;
                top: 10px;
                right: 10px;
                background: red;
                color: white;
                border: none;
                border-radius: 5px;
                padding: 5px 10px;
                cursor: pointer;
            `;
            closeButton.addEventListener('click', () => {
                modal.remove();
                removeOverlay();
            });
        
            const customEventCheckbox = document.createElement('input');
            customEventCheckbox.type = 'checkbox';
            customEventCheckbox.id = 'customEventCheckbox';
            customEventCheckbox.style.marginRight = '10px';
        
            const customEventLabel = document.createElement('label');
            customEventLabel.htmlFor = 'customEventCheckbox';
            customEventLabel.innerText = 'Add custom event/Task, etc. (Meetings, Horde outages, etc.)';
        
            // In the showShiftReportModal function, modify the customEventInput creation:
            const customEventInput = document.createElement('input');
            customEventInput.type = 'number';
            customEventInput.id = 'customEventInput';
            customEventInput.placeholder = 'Minutes';
            customEventInput.min = '0';
            customEventInput.max = totalMinutes.toString(); // Set maximum to total shift duration
            customEventInput.style.cssText = `
                display: none;
                margin-top: 10px;
                width: 50%;
                padding: 5px;
                border: 1px solid #ccc;
                border-radius: 5px;
            `;

            // Add input validation
            customEventInput.addEventListener('input', () => {
                const inputValue = parseInt(customEventInput.value);
                if (inputValue > totalMinutes) {
                    alert(`Value cannot exceed shift duration (${totalMinutes} minutes)`);
                    customEventInput.value = totalMinutes;
                } else if (inputValue < 0) {
                    customEventInput.value = 0;
                }
                updateProductivity();
            });

            // Also validate on blur to catch pasted values
            customEventInput.addEventListener('blur', () => {
                const inputValue = parseInt(customEventInput.value);
                if (inputValue > totalMinutes) {
                    customEventInput.value = totalMinutes;
                    alert(`Value cannot exceed shift duration (${totalMinutes} minutes)`);
                    updateProductivity();
                }
            });
        
            customEventCheckbox.addEventListener('change', () => {
                if (customEventCheckbox.checked) {
                    customEventInput.style.display = 'block';
                } else {
                    customEventInput.style.display = 'none';
                }
                updateProductivity();
            });
        
        
            // Custom multiplier checkbox and label
            const customMultiplierCheckbox = document.createElement('input');
            customMultiplierCheckbox.type = 'checkbox';
            customMultiplierCheckbox.id = 'customMultiplierCheckbox';
            customMultiplierCheckbox.style.marginRight = '10px';
        
            const customMultiplierLabel = document.createElement('label');
            customMultiplierLabel.htmlFor = 'customMultiplierCheckbox';
            customMultiplierLabel.innerText = 'Custom multipliers';
        
            // Create a container for the custom multiplier elements
            const customMultiplierContainer = document.createElement('div');
            customMultiplierContainer.id = 'customMultiplierContainer';
            customMultiplierContainer.style.cssText = 'margin-top: 20px; display: none;'; // Add margin to create visual separation
        
            // Create a table for case type data
            const caseTypeTable = document.createElement('table');
            caseTypeTable.style.cssText = 'width: 100%; border-collapse: collapse; margin-top: 20px; table-layout: fixed;';
            caseTypeTable.innerHTML = `
                <thead>
                    <tr>
                        <th style="border: 1px solid #ccc; padding: 8px;">Case Type</th>
                        <th style="border: 1px solid #ccc; padding: 8px;">Time</th>
                        <th style="border: 1px solid #ccc; padding: 8px;">Count</th>
                        <th style="border: 1px solid #ccc; padding: 8px; width: 40%;">Custom Multiplier</th>
                    </tr>
                </thead>
                <tbody id="caseTypeTableBody"></tbody>
            `;
        
            const caseTypeTableBody = caseTypeTable.querySelector('#caseTypeTableBody');
        
            // Add rows for each case type with a count > 0
            Object.entries(caseTypeCounts).forEach(([caseType, count]) => {
                if (count > 0) {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td style="border: 1px solid #ccc; padding: 8px;">${caseType}</td>
                        <td id="${caseType.replace(/\s+/g, '')}Time" style="border: 1px solid #ccc; padding: 8px;"></td>
                        <td style="border: 1px solid #ccc; padding: 8px;">${count}</td>
                        <td style="border: 1px solid #ccc; padding: 8px; width: 150px;">
                            <input type="checkbox" id="${caseType.replace(/\s+/g, '')}CustomMultiplierCheckbox" style="margin-right: 10px;">
                            <input type="range" id="${caseType.replace(/\s+/g, '')}Multiplier" min="0.05" max="10" step="0.05" value="${caseTypeMultipliers[caseType]}" style="width: 80%; display: none;">
                            <span id="${caseType.replace(/\s+/g, '')}MultiplierValue" style="display: none; width: 40px; display: inline-block;">${caseTypeMultipliers[caseType]}</span>
                        </td>
                    `;
        
                    caseTypeTableBody.appendChild(row);
                }
            });
        
            const copyButton = document.createElement('button');
            copyButton.innerText = 'Copy cases';
            copyButton.style.cssText = `
                position: absolute;
                bottom: 10px;
                right: 10px;
                background: #007bff;
                color: white;
                border: none;
                border-radius: 5px;
                padding: 5px 10px;
                cursor: pointer;
            `;
            copyButton.addEventListener('click', () => {
                // Group cases by Case Type
                const groupedCases = caseLog.reduce((acc, entry) => {
                    const key = entry.caseOwner;
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(entry.caseNumber);
                    return acc;
                }, {});
        
                // Format the grouped cases for clipboard
                const clipboardText = Object.entries(groupedCases)
                    .map(([type, cases]) => `${type}: ${cases.join(', ')}`)
                    .join('\n');
        
                navigator.clipboard.writeText(clipboardText).then(() => {
                    alert('Case numbers copied to clipboard!');
                });
            });
        
            // Convert start and end times to PST
            const startPST = new Date(start).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
            const endPST = new Date(end).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
        
            modal.innerHTML = `
                <h2 style="font-size: 18px; text-align: center;"><strong>Shift Report | <a href="https://docs.google.com/forms/d/e/1FAIpQLScq0s79IexykF6BRDOEowKXtGyDQDw3t1_yR4CDRJyQfSihVg/viewform" target="_blank">Form Link</a></strong></h2>
                <hr>
                <p><strong>Date:</strong> ${new Date(start).toLocaleDateString()}</p>
                <p><strong>Start (PST):</strong> ${startPST}</p>
                <p><strong>End (PST):</strong> ${endPST}</p>
                <p><strong>Duration:</strong> ${duration}</p>
                <hr>
                <p><strong>Total Cases:</strong> ${totalCases}</p>
                ${caseTypeTable.outerHTML}
                <br>
                <h3>Productivity</h3>
                <br>
                <table id="productivityTable" style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <th style="border: 1px solid #ccc; padding: 8px;">APH (Actions per hour)</th>
                        ${generateCaseTypeHeaders(caseTypeCounts)}
                    </tr>
                    <tr>
                        <td id="aph" style="border: 1px solid #ccc; padding: 8px;"></td>
                        ${generateCaseTypeProductivityCells(caseTypeCounts)}
                    </tr>
                </table>
                <br>
            `;
        
            modal.appendChild(customEventCheckbox);
            modal.appendChild(customEventLabel);
            modal.appendChild(customEventInput);
            modal.appendChild(copyButton);
            modal.appendChild(closeButton);
        
            // Replace the placeholder with the custom multiplier container
            const placeholder = modal.querySelector('#customMultiplierContainerPlaceholder');
            if (placeholder) {
                placeholder.replaceWith(customMultiplierCheckbox);
                customMultiplierCheckbox.insertAdjacentElement('afterend', customMultiplierLabel);
                customMultiplierLabel.insertAdjacentElement('afterend', customMultiplierContainer);
            }
        
            document.body.appendChild(modal);
        
            // Attach event listeners to the dynamically created elements
            Object.entries(caseTypeCounts).forEach(([caseType, count]) => {
                if (count > 0) {
                    const checkbox = document.getElementById(`${caseType.replace(/\s+/g, '')}CustomMultiplierCheckbox`);
                    const slider = document.getElementById(`${caseType.replace(/\s+/g, '')}Multiplier`);
                    const valueDisplay = document.getElementById(`${caseType.replace(/\s+/g, '')}MultiplierValue`);
        
                    checkbox.addEventListener('change', () => {
                        if (checkbox.checked) {
                            slider.style.display = 'inline';
                            valueDisplay.style.display = 'inline';
                        } else {
                            slider.style.display = 'none';
                            valueDisplay.style.display = 'inline'; // Ensure the value display is visible
                            slider.value = caseTypeMultipliers[caseType]; // Reset to default value
                            valueDisplay.innerText = caseTypeMultipliers[caseType]; // Update display
                        }
                        updateProductivity();
                    });
        
                    slider.addEventListener('input', () => {
                        valueDisplay.innerText = slider.value;
                        updateProductivity();
                    });
                }
            });
        
            customMultiplierCheckbox.addEventListener('change', () => {
                const customMultiplierContainer = document.getElementById('customMultiplierContainer');
                if (customMultiplierContainer) {
                    if (customMultiplierCheckbox.checked) {
                        customMultiplierContainer.style.display = 'block';
                    } else {
                        customMultiplierContainer.style.display = 'none';
                    }
                    updateProductivity();
                }
            });
        
            function updateProductivity() {
                const customMinutes = parseInt(customEventInput.value) || 0;
                const effectiveDuration = totalMinutes - customMinutes;
        
                const customMultipliers = {};
                Object.entries(caseTypeCounts).forEach(([caseType, count]) => {
                    if (count > 0) {
                        const slider = document.getElementById(`${caseType.replace(/\s+/g, '')}Multiplier`);
                        customMultipliers[caseType] = slider ? parseFloat(slider.value) : caseTypeMultipliers[caseType];
                    }
                });
        
                console.log('Effective Duration:', effectiveDuration);
                console.log('Custom Multipliers:', customMultipliers);
        
                const workTimes = calculateWorkTimesWithCustomMultipliers(effectiveDuration, caseTypeCounts, customMultipliers);
        
                console.log('Work Times:', workTimes);
        
                Object.entries(workTimes).forEach(([caseType, time]) => {
                    const timeElement = document.getElementById(`${caseType.replace(/\s+/g, '')}Time`);
                    if (timeElement) {
                        timeElement.innerText = `${Math.round(time)} minutes`;
                    }
                });
        
                const aph = Object.values(caseTypeCounts).reduce((sum, count) => sum + count, 0) / (effectiveDuration / 60);
                document.getElementById('aph').innerText = aph.toFixed(2);
        
                Object.entries(caseTypeCounts).forEach(([caseType, count]) => {
                    const time = workTimes[caseType];
                    const perHour = count > 0 ? count / (time / 60) : 0;
                    const perHourElement = document.getElementById(`${caseType.replace(/\s+/g, '')}PerHour`);
                    if (perHourElement) {
                        perHourElement.innerText = perHour.toFixed(2);
                    }
                });
        
                // Update slider values display
                Object.entries(caseTypeCounts).forEach(([caseType, count]) => {
                    if (count > 0) {
                        const slider = document.getElementById(`${caseType.replace(/\s+/g, '')}Multiplier`);
                        const valueDisplay = document.getElementById(`${caseType.replace(/\s+/g, '')}MultiplierValue`);
                        if (slider && valueDisplay) {
                            valueDisplay.innerText = slider.value;
                        }
                    }
                });
            }
        
            function calculateWorkTimesWithCustomMultipliers(shiftDurationMinutes, caseTypeCounts, customMultipliers) {
                const totalWeightedCases = Object.entries(caseTypeCounts).reduce((sum, [caseType, count]) => {
                    if (count > 0) {
                        const multiplier = customMultipliers[caseType];
                        if (isNaN(multiplier) || isNaN(count)) {
                            console.error(`Invalid multiplier or count for case type ${caseType}: multiplier=${multiplier}, count=${count}`);
                            return sum;
                        }
                        return sum + (count * multiplier);
                    }
                    return sum;
                }, 0);
        
                console.log('Total Weighted Cases:', totalWeightedCases);
        
                const workTimes = {};
                Object.entries(caseTypeCounts).forEach(([caseType, count]) => {
                    if (count > 0) {
                        const multiplier = customMultipliers[caseType];
                        if (isNaN(multiplier) || isNaN(count) || totalWeightedCases === 0) {
                            console.error(`Invalid calculation for case type ${caseType}: multiplier=${multiplier}, count=${count}, totalWeightedCases=${totalWeightedCases}`);
                            workTimes[caseType] = NaN;
                        } else {
                            workTimes[caseType] = (shiftDurationMinutes * (count * multiplier)) / totalWeightedCases;
                        }
                    }
                });
        
                return workTimes;
            }
        
            updateProductivity(); // Initial calculation
        }
        
        function generateCaseTypeHeaders(caseTypeCounts) {
            return Object.keys(caseTypeCounts).map(caseType => `
                <th style="border: 1px solid #ccc; padding: 8px;">${caseType} / hour</th>
            `).join('');
        }
        
        function generateCaseTypeProductivityCells(caseTypeCounts) {
            return Object.keys(caseTypeCounts).map(caseType => `
                <td id="${caseType.replace(/\s+/g, '')}PerHour" style="border: 1px solid #ccc; padding: 8px;"></td>
            `).join('');
        }


        //END OF SHIFT REPORT MODAL

    function parseEvents(data) {
        const events = [];
        const eventBlocks = data.split('BEGIN:VEVENT').slice(1); // Split text into individual events

        eventBlocks.forEach(block => {
            const dtStartMatch = block.match(/DTSTART;TZID=.*?:(\d{8}T\d{6})/);
            const dtEndMatch = block.match(/DTEND;TZID=.*?:(\d{8}T\d{6})/);
            const summaryMatch = block.match(/SUMMARY:(.+)/);

            if (dtStartMatch && dtEndMatch && summaryMatch) {
                const start = dtStartMatch[1];
                const end = dtEndMatch[1];
                const summary = summaryMatch[1].trim();

                // Parse the start and end times
                const startDate = new Date(
                    `${start.substring(0, 4)}-${start.substring(4, 6)}-${start.substring(6, 8)}T${start.substring(9, 11)}:${start.substring(11, 13)}:${start.substring(13, 15)}-08:00` // Adjust for Los Angeles time zone
                );
                const endDate = new Date(
                    `${end.substring(0, 4)}-${end.substring(4, 6)}-${end.substring(6, 8)}T${end.substring(9, 11)}:${end.substring(11, 13)}:${end.substring(13, 15)}-08:00`
                );

                // Calculate the duration in hours
                const duration = (endDate - startDate) / (1000 * 60 * 60);

                events.push({
                    summary,
                    start: startDate,
                    end: endDate,
                    duration: `${duration} hours`,
                });
            }
        });

        console.log('Parsed Events:', events); // Debugging log
        return events;
    }

    function getCurrentAndNextShifts(shifts, displayedShifts) {
        const now = new Date();
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(now.getDate() - 3);
        console.log('Current Date and Time:', now); // Debugging log
    
        // Map shifts to include parsed dates
        const filteredShifts = shifts
            .map(shift => {
                const start = new Date(shift.start);
                const end = new Date(shift.end);
                console.log('Shift Start:', start, 'Shift End:', end); // Debugging log
                return {
                    ...shift,
                    start,
                    end
                };
            })
            .filter(shift => shift.end > threeDaysAgo) // Filter shifts within the last 3 days and future
            .sort((a, b) => a.start - b.start); // Sort by start time
    
        // Separate past and future shifts
        const pastShifts = filteredShifts.filter(shift => shift.end <= now);
        const futureShifts = filteredShifts.filter(shift => shift.end > now);
    
        // Limit past shifts to `displayedShifts - 1`
        const limitedPastShifts = pastShifts.length >= displayedShifts
            ? pastShifts.slice(-1 * (displayedShifts - 1))
            : pastShifts;
    
        // Combine limited past shifts and future shifts
        const combinedShifts = [...limitedPastShifts, ...futureShifts];
    
        console.log('Filtered Shifts:', combinedShifts); // Debugging log
        return combinedShifts;
    }
    

    //Using this version to avoid getting 4.10 as the earliest version instead of 4.2 for example.
    function getEarliestUEVersion(engineVersion) {
        const versions = engineVersion.split(';').map(v => v.replace('UE_', ''));
        return versions.sort((a, b) => {
            const [aMajor, aMinor] = a.split('.').map(Number);
            const [bMajor, bMinor] = b.split('.').map(Number);
            if (aMajor !== bMajor) return aMajor - bMajor;
            return aMinor - bMinor;
        })[0];
    }

    function getTargetPlatforms(platforms) {
        const targetPlatforms = ['Windows'];
        if (platforms.includes('Mac') || platforms.includes('iOS')) {
            targetPlatforms.push('Mac');
        }
        return targetPlatforms;
    }

    function getCustomEngineVersion(earliestUEVersion) {
        const versionMap = {
            '4.20': '4.20.3-4369336+++UE4+Release-4.20',
            '4.21': '4.21.2-4753647+++UE4+Release-4.21',
            '4.22': '4.22.3-7053642+++UE4+Release-4.22',
            '4.23': '4.23.1-9631420+++UE4+Release-4.23',
            '4.24': '4.24.3-11590370+++UE4+Release-4.24',
            '4.25': '4.25.4-14469661+++UE4+Release-4.25',
            '4.26': '4.26.2-14830424+++UE4+Release-4.26',
            '4.27': '4.27.0-17155196+++UE4+Release-4.27',
            '5.0': '5.0.0-19505902+++UE5+Release-5.0',
            '5.1': '5.1.0-23058290+++UE5+Release-5.1',
            '5.2': '5.2.0-25360045+++UE5+Release-5.2',
            '5.3': '5.3.0-27405482+++UE5+Release-5.3',
            '5.4': '5.4.0-33043543+++UE5+Release-5.4',
            '5.5': '5.5.0-37670630+++UE5+Release-5.5'
        };
        return versionMap[earliestUEVersion];
    }

    function getHordeAppData(appName) {
        const data = [];
        const caseNumber = getCaseNumber();
    
        // Retrieve Case Owner from the log if it exists
        const caseLog = JSON.parse(localStorage.getItem('sfCaseLog')) || [];
        const loggedCase = caseLog.find(entry => entry.caseNumber === caseNumber);
    
        const caseOwner = loggedCase?.caseOwner || getCaseOwner(); // Use logged value or fallback
        console.log(`Using Case Owner: ${caseOwner}`);
    
        console.log("Processing 'Listing Content' for Horde...");
    
        const spans = getAllShadowElements(document.body, 'span.test-id__section-header-title');
        const listingSpan = Array.from(spans).find((span) => span.textContent.trim() === 'Listing Content');
    
        if (!listingSpan) {
            console.error("Could not find the 'Listing Content' section, you must be in a New Submission or Update case to use this.");
            alert("Could not find the 'Listing Content' section, you must be in a New Submission or Update case to use this.");
            return data;
        }
    
        const listingSection = listingSpan.closest('section');
        if (!listingSection) {
            console.error("'Listing Content' section found, but no parent section found.");
            alert("'Listing Content' section found, but no parent section found.");
            return data;
        }
    
        // Extract the rows from the table
        const rows = listingSection.querySelectorAll('table tr');
        if (rows.length === 0) {
            console.error("No rows found in the 'Listing Content' section.");
            alert("No rows found in the 'Listing Content' section.");
            return data;
        }
    
        const info = Array.from(rows).slice(1).map((row) => {
            const cells = row.querySelectorAll('td');
            return {
                appName: cells[0]?.textContent.trim() || 'N/A',
                engineVersion: cells[2]?.textContent.trim() || 'N/A',
                targetPlatforms: cells[3]?.textContent.trim() || 'N/A',
                versionNotes: cells[4]?.textContent.trim() || 'N/A',
                downloadLink: cells[5]?.querySelector('a')?.href || 'N/A',
                isNewOrChanged: cells[6]?.textContent.trim() || 'N/A',
            };
        }).filter((item) => item.isNewOrChanged === 'YES' && item.appName === appName);
    
        // Retrieve the Distribution Method
        const paragraphs = getAllShadowElements(document.body, 'p');
        const distributionMethodParagraph = paragraphs.find((p) => p.textContent.includes('Distribution Method:'));
        const distributionMethod = distributionMethodParagraph?.textContent.replace('Distribution Method:', '').trim() || 'No Distribution Method found.';
    
        info.forEach(item => {
            const earliestUEVersion = getEarliestUEVersion(item.engineVersion);
            const targetPlatforms = getTargetPlatforms(item.targetPlatforms);
            const customEngineVersion = distributionMethod === 'CODE_PLUGIN' ? getCustomEngineVersion(earliestUEVersion) : null;
    
            data.push({
                appName: item.appName,
                distributionMethod,
                earliestUEVersion,
                targetPlatforms,
                customEngineVersion
            });
        });
    
        console.log('Collected app data for Horde:', data);
        return data;
    }

    // Function to send Horde app data
    function sendHordeAppData(appData) {
        const hordeUrl = 'https://horde.devtools.epicgames.com/stream/ue5-marketplace?tab=General';
        const hordeWindow = window.open(hordeUrl, '_blank');

    // Use a timeout to ensure the window is fully loaded before sending the message
        setTimeout(() => {
            hordeWindow.postMessage({ type: 'HORDE_APP_DATA', data: appData, customProperty: 'SFHelper' }, hordeUrl);
        }, 2000); // Adjust the delay as needed
    }

    // Function to get some relevant shifts to show in the Shift
    function getRelevantShiftIfExists() {
        const tandaData = localStorage.getItem('parsedTandaScheduleData');
        if (!tandaData) return null;

        const shifts = JSON.parse(tandaData);
        const groupedShifts = groupShifts(shifts); // Group the shifts
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // show the shift that ended within the last hour

        return groupedShifts.find(shift => {
            const start = new Date(shift.start);
            const end = new Date(shift.end);
            return (start <= now && end >= now) || (end > oneHourAgo && end <= now);
        });
    }  
})();
