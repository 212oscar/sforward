// ==UserScript==
// @name         Salesforce Helper for ModSquad UE MKTP
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  Process selected info, copy App Name, copy SF Case, and manage cases with floating buttons.
// @author       Oscar O.
// @match        https://epicgames.lightning.force.com/lightning/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/212oscar/sforward/main/tp-uemkp-scripts/SFhelper.js
// @updateURL    https://raw.githubusercontent.com/212oscar/sforward/main/tp-uemkp-scripts/SFhelper.js
// @history      2.5 Added button reset all settings and fixed the Edit button (for the TRC templates) not showing up
// ==/UserScript==

(function () {
    'use strict';

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

    // Function to show a modal with a message
    function showAlertModal(message) {
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

        // Automatically close the modal after 2 seconds
        setTimeout(() => {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
        }, 2000);
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
        link.href = 'https://212oscar.github.io/sforward/documentation.html'; // Replace with the actual documentation link
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
                localStorage.setItem(key, inputValue);
                callback(inputValue);
            });
        } else {
            callback(value);
        }
    }

    // Function to get user information from local storage or prompt if not available
    function getUserInfo(callback) {
        promptForInfo('folderId', 'Please enter your Google Drive folder ID:', (folderId) => {
            callback({ folderId });
        });
    }

    // Function to get TRC template ID from local storage or prompt if not available
    function getTemplateSheetId(template, callback) {
        promptForInfo(template, `Please enter the Google Sheet ID for the ${template} template:`, (sheetId) => {
            callback(sheetId);
        });
    }

    // Function to show a modal to edit stored template IDs and folder ID
    function showEditModal() {
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
            const label = document.createElement('label');
            label.innerText = `${template} Template ID:`;
            form.appendChild(label);

            const input = document.createElement('input');
            input.type = 'text';
            input.value = localStorage.getItem(template) || '';
            input.dataset.template = template;
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
        folderLabel.innerText = 'Google Drive Folder ID:';
        form.appendChild(folderLabel);

        const folderInput = document.createElement('input');
        folderInput.type = 'text';
        folderInput.value = localStorage.getItem('folderId') || '';
        folderInput.dataset.template = 'folderId';
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
                if (value) {
                    localStorage.setItem(key, value);
                } else {
                    localStorage.removeItem(key);
                }
            });
            document.body.removeChild(modal);
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
        const section2 = createSection('section2', '350px');
        const section3 = createSection('section3', '550px');

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
            closeExistingModal(); // Close any existing modal
            const info = processListingContent();
            const distributionMethod = getDistributionMethod(info[0]); // Assuming all items have the same distribution method
            const opsReviewText = 'Ops Review required due to a previously unpublished Unreal Engine format'; // Example text
            const caseOwner = getCaseOwner();
            displayInfoInModal(distributionMethod, info, opsReviewText, caseOwner);
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
                copyToClipboard(caseNumber, copyCaseButton);
            } else {
                alert('SF Case Number not found!');
            }
        });
        section1.appendChild(copyCaseButton);

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
        const createTRCButton = createButton('Create TRC', '#6f42c1', () => {
            checkPageLoading();
            if (isPageLoading) {
                showAlertModal(pageNotLoadedMessage);
                return;
            }
            closeExistingModal(); // Close any existing modal
            trcTemplateMenu.style.display = 'block';
        });
        createTRCButton.addEventListener('mouseleave', () => {
            setTimeout(() => {
                if (!trcTemplateMenu.matches(':hover')) {
                    trcTemplateMenu.style.display = 'none';
                }
            }, 500);
        });
        trcTemplateMenu.addEventListener('mouseleave', () => {
            trcTemplateMenu.style.display = 'none';
        });
        section1.appendChild(createTRCButton);

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

        // Create the "Case Log" button
        const viewLogButton = createButton('Case Log', '#ff5722', () => {
            viewCaseLog(); // Call the function to display the log
        });
        section3.appendChild(viewLogButton);

        // Create the "Add my shift" button (Purple)
        const addShiftButton = createButton('Add my shift', '#6f42c1', () => {
            showShiftDataInputModal('Please go to your Tanda schedule URL (https://my.tanda.co/staff), click on your name / Attendance points / Schedules, copy all the content from the iCal link, and paste it here:', (tandaData) => {
                if (tandaData) {
                    const parsedEvents = parseEvents(tandaData);
                    localStorage.setItem('parsedTandaScheduleData', JSON.stringify(parsedEvents));
                    location.reload(); // Reload the page to initialize the shift info
                }
            });
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

    let selectedTemplate = 'props_environments'; // Default template

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
                const newTabUrl = `https://212oscar.github.io/sforward/create-trc.html?productTitle=${encodeURIComponent(productTitle)}&caseNumber=${encodeURIComponent(caseNumber)}&sheetID=${encodeURIComponent(sheetID)}&folderId=${encodeURIComponent(folderId)}`;
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

        // Filter out past grouped shifts and sort by start time
        const futureGroupedShifts = groupedShifts.filter(shift => new Date(shift.end) > now).sort((a, b) => new Date(a.start) - new Date(b.start));

        if (futureGroupedShifts.length === 0) return;

        // Set reminders for the next upcoming grouped shift
        const nextGroupedShift = futureGroupedShifts[0];
        const start = new Date(nextGroupedShift.start);
        const end = new Date(nextGroupedShift.end);

        // Reminder to clock in 2 minutes before the shift starts
        const clockInReminderTime = new Date(start.getTime() - 2 * 60 * 1000);
        if (clockInReminderTime > now) {
            const clockInTimeout = clockInReminderTime - now;
            const clockInTimerId = setTimeout(() => {
                showReminderModal('Your shift is starting, remember to:\n\n- Clock-in on Workforce app\n- Clock-in on Modsquad and Epic Games Slack', start, end);
            }, clockInTimeout);
            reminderTimers.push(clockInTimerId);
        }

        // Reminder to clock out 2 minutes before the shift ends
        const clockOutReminderTime = new Date(end.getTime() - 2 * 60 * 1000);
        if (clockOutReminderTime > now) {
            const clockOutTimeout = clockOutReminderTime - now;
            const clockOutTimerId = setTimeout(() => {
                showReminderModal('Your shift is ending, remember to:\n\n- Clock-out on Workforce app\n- Clock-out on Modsquad Slack\n- Send your shift report', start, end);
            }, clockOutTimeout);
            reminderTimers.push(clockOutTimerId);
        }
    }

    function clearShiftReminders() {
        reminderTimers.forEach(timerId => clearTimeout(timerId));
        reminderTimers = [];
    }

    function showReminderModal(message, start, end) {
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

        const startPST = new Date(start).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
        const endPST = new Date(end).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });

        const messageDiv = document.createElement('div');
        messageDiv.innerHTML = `
            <p>${message}</p>
            <p><strong>Start (PST):</strong> ${startPST}</p>
            <p><strong>End (PST):</strong> ${endPST}</p>
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
        });

        modal.appendChild(allDoneButton);
        document.body.appendChild(modal);
    }

    function createSection(id, top) {
        const section = document.createElement('div');
        section.id = id;
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
        linkIcon.href = 'https://212oscar.github.io/sforward/documentation.html';
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
        const newSubmissionsCount = caseLog.filter(entry => entry.caseOwner === 'NEW SUBMISSIONS').length;
        const updatesCount = caseLog.filter(entry => entry.caseOwner === 'UPDATE').length;

        // Clear existing modal if present
        const existingModal = document.getElementById('custom-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = createModal(); // Reuse your existing modal creation function

        // Add total counts
        const totalCasesDiv = document.createElement('div');
        totalCasesDiv.style.cssText = 'margin-bottom: 10px; font-weight: bold;';
        totalCasesDiv.innerText = `New Subs: ${newSubmissionsCount} | Updates: ${updatesCount} | Total: ${caseLog.length}`;
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
                        <option value="NEW SUBMISSIONS" ${entry.caseOwner === 'NEW SUBMISSIONS' ? 'selected' : ''}>NEW SUBMISSIONS</option>
                        <option value="UPDATE" ${entry.caseOwner === 'UPDATE' ? 'selected' : ''}>UPDATE</option>
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
        addLogButtons(modal, caseLog);
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
                const key = entry.caseOwner === 'Fab Submission Support New' ? 'New submissions' : 'Updates';
                if (!acc[key]) acc[key] = [];
                acc[key].push(entry.caseNumber);
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

    function processListingContent() {
        const caseNumber = getCaseNumber();

        if (!caseNumber) {
            console.error('Case Number not found.');
            alert('Case Number not found.');
            return [];
        }

        // Find the aria-controls value associated with the active tab
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

        // Locate the section element with the corresponding ID
        const sectionElement = document.getElementById(ariaControls);
        if (!sectionElement) {
            console.error('Section element not found.');
            alert('Section element not found.');
            return [];
        }

        // Use getAllShadowElements to find elements within the section
        const spans = getAllShadowElements(sectionElement, 'span.test-id__section-header-title');
        const listingSpan = Array.from(spans).find((span) => span.textContent.trim() === 'Listing Content');

        if (!listingSpan) {
            console.error("Could not find the 'Listing Content' section.");
            alert("Could not find the 'Listing Content' section.");
            return [];
        }

        const listingSection = listingSpan.closest('section');
        if (!listingSection) {
            console.error("'Listing Content' section found, but no parent section found.");
            alert("'Listing Content' section found, but no parent section found.");
            return [];
        }

        // Extract the rows from the table
        const rows = listingSection.querySelectorAll('table tr');
        if (rows.length === 0) {
            console.error("No rows found in the 'Listing Content' section.");
            alert("No rows found in the 'Listing Content' section.");
            return [];
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
        }).filter((item) => item.isNewOrChanged === 'YES');

        // Retrieve the Distribution Method
        const paragraphs = getAllShadowElements(sectionElement, 'p');
        const distributionMethodParagraph = paragraphs.find((p) => p.textContent.includes('Distribution Method:'));
        const distributionMethod = distributionMethodParagraph?.textContent.replace('Distribution Method:', '').trim() || 'No Distribution Method found.';

        // Retrieve the Ops Review information
        const opsReviewParagraph = paragraphs.find((p) => p.textContent.includes('Ops Review required'));
        const opsReviewText = opsReviewParagraph?.textContent.trim() || 'No Ops Review information found.';

        console.log('Distribution Method:', distributionMethod);
        console.log('Filtered Info:', info);
        console.log('Ops Review:', opsReviewText);

        // Display the collected info in a modal
        displayInfoInModal(distributionMethod, info, opsReviewText, getCaseOwner());
    }

    function displayInfoInModal(distributionMethod, info, opsReviewText, caseOwner) {
        const modal = createModal();
        const modalContent = document.createElement('div');
        modalContent.style.cssText = 'margin-top: 20px;';
    
        // Map case owner to title
        const ownerTitleMap = {
            'Fab Submission Support New': 'NEW SUBMISSION',
            'Fab Submission Support Update': 'UPDATE',
        };
    
        // Get the case number
        const caseNumber = getCaseNumber();
        console.log('Case Number:', caseNumber); // Debugging log
    
        // Find the aria-controls value associated with the active tab
        const tabElement = document.querySelector(`a[title^="${caseNumber}"]`);
        let isCancelled = false;
        let colorSquare = '';
    
        if (tabElement) {
            const ariaControls = tabElement.getAttribute('aria-controls');
            console.log('aria-controls:', ariaControls); // Debugging log
    
            if (ariaControls) {
                // Locate the section element with the corresponding ID
                const sectionElement = document.getElementById(ariaControls);
                if (sectionElement) {
                    console.log('Section element found:', sectionElement); // Debugging log
    
                    // Check if "Cancelled" text is found within the section
                    isCancelled = findTextInShadow(sectionElement, 'Cancelled') !== null;
                    console.log('Is Cancelled:', isCancelled); // Debugging log
    
                    // Check for the img element with specific src attributes
                    const greenImg = findElementByAttribute(sectionElement, 'img', 'src', '/img/samples/color_green.gif');
                    const cyanImg = findElementByAttribute(sectionElement, 'img', 'src', '/servlet/servlet.FileDownload?file=0151a000002OTAA');
                    const yellowImg = findElementByAttribute(sectionElement, 'img', 'src', '/img/samples/color_yellow.gif');
    
                    if (greenImg.length > 0) {
                        colorSquare = '<span style="display: inline-block; width: 20px; height: 20px; background-color: green !important; margin-right: 5px; margin-bottom: -3px !important;" title="Seller Warning Indicator"></span>';
                    } else if (cyanImg.length > 0) {
                        colorSquare = '<span style="display: inline-block; width: 20px; height: 20px; background-color: cyan !important; margin-right: 5px; margin-bottom: -3px !important;" title="Seller Warning Indicator"></span>';
                    } else if (yellowImg.length > 0) {
                        colorSquare = '<span style="display: inline-block; width: 20px; height: 20px; background-color: #fcca03 !important; margin-right: 5px; margin-bottom: -3px !important;" title="Seller Warning Indicator"></span>';
                    } else {
                        console.log('No matching img element found'); // Debugging log
                    }
                } else {
                    console.log('Section element not found'); // Debugging log
                }
            } else {
                console.log('aria-controls attribute not found'); // Debugging log
            }
        } else {
            console.log('Tab element not found'); // Debugging log
        }
    
        // Add case owner title, case number, and "CANCELLED" if applicable
        const ownerTitleDiv = document.createElement('div');
        ownerTitleDiv.style.cssText = 'font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 10px;';
        ownerTitleDiv.innerHTML = `${colorSquare}${caseOwner} | ${caseNumber}${isCancelled ? ' | <span style="color: red !important; font-weight: bold;">CANCELLED</span>' : ''}`;
        modalContent.appendChild(ownerTitleDiv);
    
        // Display Distribution Method
        const distributionDiv = document.createElement('div');
        distributionDiv.style.marginBottom = '20px';
        distributionDiv.innerHTML = `
            <strong>Distribution Method:</strong> ${distributionMethod}
        `;
        modalContent.appendChild(distributionDiv);
    
        // Display rows with "YES" in the last column
        if (info.length === 0) {
            modalContent.innerHTML += '<strong>No rows with "YES" in the last column found.</strong>';
        } else {
            info.forEach((item) => {
                const itemDiv = document.createElement('div');
                itemDiv.style.marginBottom = '15px';
    
                const copyButton = document.createElement('button');
                copyButton.innerText = 'Copy App Name';
                copyButton.style.cssText = `
                    margin-top: 5px;
                    background: #28a745;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    padding: 5px 10px;
                    cursor: pointer;
                `;
                copyButton.addEventListener('click', () => {
                    copyToClipboard(item.appName, copyButton);
                });
    
                const p4vButton = document.createElement('button');
                p4vButton.innerText = 'P4V data';
                p4vButton.style.cssText = `
                    margin-top: 5px;
                    margin-left: 10px;
                    background: #ff9800;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    padding: 5px 10px;
                    cursor: pointer;
                `;
                p4vButton.addEventListener('click', () => {
                    const p4vData = {
                        earliestUEVersion: getEarliestUEVersion(item.engineVersion),
                        distributionMethod: distributionMethod,
                        appName: item.appName
                    };
                    copyToClipboard(JSON.stringify(p4vData, null, 2), p4vButton);
                });
    
                const hordeButton = document.createElement('button');
                hordeButton.innerText = 'Horde';
                hordeButton.style.cssText = `
                    margin-top: 5px;
                    margin-left: 10px;
                    background: #007bff;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    padding: 5px 10px;
                    cursor: pointer;
                `;
                hordeButton.addEventListener('click', () => {
                    const appName = item.appName; // Get the specific app name
                    console.log('Horde button clicked for app:', appName); // Debugging log
    
                    const appData = getHordeAppData(appName); // Collect data for the specific app name
                    console.log('Collected app data:', appData); // Debugging log
    
                    const newTab = window.open('https://horde.devtools.epicgames.com/stream/ue5-marketplace?tab=General', '_blank');
                    if (newTab) {
                        console.log('New tab opened'); // Debugging log
    
                        // Use a small delay to ensure the new tab is fully loaded
                        setTimeout(() => {
                            console.log('Sending message to new tab'); // Debugging log
                            newTab.postMessage(appData, '*');
                        }, 2000); // Adjust the delay as needed
                    } else {
                        console.error('Failed to open new tab'); // Debugging log
                    }
                });
    
                itemDiv.innerHTML = `
                    <strong>App Name:</strong> ${item.appName}<br>
                    <strong>Engine Version:</strong> ${item.engineVersion}<br>
                    <strong>Target Platforms:</strong> ${item.targetPlatforms}<br>
                    <strong>Version Notes:</strong> ${item.versionNotes}<br>
                    <strong>Is New or Changed:</strong> ${item.isNewOrChanged}<br>
                    <strong>Download:</strong> ${item.downloadLink !== 'N/A' ? createDownloadLinks(item.downloadLink) : 'N/A'}<br>
                `;
    
                itemDiv.appendChild(copyButton);
                itemDiv.appendChild(p4vButton);
                itemDiv.appendChild(hordeButton);
                modalContent.appendChild(itemDiv);
            });
        }
    
        // Display Ops Review information
        const opsReviewDiv = document.createElement('div');
        opsReviewDiv.style.marginTop = '20px';
        opsReviewDiv.innerHTML = `
            <strong>Ops Review Information:</strong><br>${opsReviewText}
        `;
        modalContent.appendChild(opsReviewDiv);
    
        modal.appendChild(modalContent);
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

    function createModal() {
        const modal = document.createElement('div');
        modal.id = 'custom-modal';
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
        });

        modal.appendChild(closeButton);
        document.body.appendChild(modal);

        return modal;
    }

    // functions to close the modal used in initializeUI
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

    function observePageContent() {
        const observer = new MutationObserver(() => {
            if (document.querySelector('body')) { // Ensure the body is fully loaded
                observer.disconnect(); // Stop observing once the content is ready
                initializeUI(); // Initialize the buttons
            }
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });
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
                    <a href="${downloadLink}" target="_blank">Link</a> |
                    <a href="${directLink}" target="_blank">Direct Link</a>
                `;
            }
        }
        // If it's not a Google Drive link, return only the normal link
        return `<a href="${downloadLink}" target="_blank">Link</a>`;
    }

    //Function to change the status of the SF Case
    function changeStatus(buttonId) {
        console.log('Starting approval process...');


        // Step 1: Locate and Click the Edit Button
        const editButtons = getAllShadowElements(document.body, 'button[title="Edit Status"]');
        const editButton = editButtons[0]; // Assuming the first found "Edit Status" button is correct
        if (editButton) {
            editButton.click();

            setTimeout(() => {
                // Step 2: Locate and Expand the Dropdown
                const dropdownButtons = getAllShadowElements(document.body, 'button[aria-label="Status"]');
                const dropdownButton = dropdownButtons[0];
                if (dropdownButton) {
                    dropdownButton.click();

                    setTimeout(() => {
                        // Step 3: Select the new status according to the clicked button
                        const dropdownItems = getAllShadowElements(document.body, 'lightning-base-combobox-item');
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
                        }

                        if (approvalOption) {
                            approvalOption.click();

                            setTimeout(() => {
                                // Step 4: Locate and Click the Save Button
                                const saveButtons = getAllShadowElements(document.body, 'button[name="SaveEdit"]');
                                const saveButton = saveButtons[0];
                                if (saveButton) {
                                    saveButton.click();
                                    console.log('Status changed and changes saved.');
                                } else {
                                    console.error('Save button not found.');
                                }
                            }, 500); // Adjust delay if needed
                        } else {
                            console.error('Approval option not found.');
                        }
                    }, 500); // Adjust delay if needed
                } else {
                    console.error('Dropdown button not found.');
                }
            }, 1000); // Adjust delay if needed
        } else {
            console.error('Edit button not found.');
        }
    }

    // Function to get the case owner
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
            if (element.textContent.includes('Fab Submission Support New')) {
                caseOwner = 'NEW SUBMISSIONS';
            } else if (element.textContent.includes('Fab Submission Support Update')) {
                caseOwner = 'UPDATE';
            }
        });

        if (caseOwner === '(Unknown Case Type)') {
            // If not found in slot elements, use findTextInShadow
            const foundNodeNew = findTextInShadow(sectionElement, 'Fab Submission Support New');
            const foundNodeUpdate = findTextInShadow(sectionElement, 'Fab Submission Support Update');

            if (foundNodeNew) {
                caseOwner = 'NEW SUBMISSIONS';
            } else if (foundNodeUpdate) {
                caseOwner = 'UPDATE';
            }
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

            // Check if the current shift and the next shift are back-to-back and have the same summary
            if (currentEnd.getTime() === nextStart.getTime() && currentShift.summary === shift.summary) {
                // Extend the current shift's end time and update the duration
                currentShift.end = shift.end;
                const durationHours = (new Date(currentShift.end) - new Date(currentShift.start)) / (1000 * 60 * 60);
                currentShift.duration = `${durationHours} hours`;
            } else {
                // Push the current shift to the grouped shifts and start a new current shift
                groupedShifts.push(currentShift);
                currentShift = { ...shift };
            }
        }

        // Push the last shift
        groupedShifts.push(currentShift);

        return groupedShifts;
    }

    let displayedShifts = 4; // Number of shifts to display in the shift table

    async function displayShiftInfo() {
        closeExistingModal(); // Close any existing modal or shift section
    
        const tandaData = localStorage.getItem('parsedTandaScheduleData');
        if (!tandaData) return;
    
        const shifts = JSON.parse(tandaData);
        console.log('Parsed Shifts:', shifts); // Debugging log
    
        const groupedShifts = groupShifts(shifts);
        console.log('Grouped Shifts:', groupedShifts); // Debugging log
    
       
        const currentAndNextShifts = getCurrentAndNextShifts(groupedShifts, displayedShifts);
        console.log('Current / Next Shifts in local time:', currentAndNextShifts); // Debugging log
    
        const now = new Date();
        const currentShiftIndex = currentAndNextShifts.findIndex(shift => new Date(shift.start) <= now && new Date(shift.end) >= now);
        const nextShiftIndex = currentAndNextShifts.findIndex(shift => new Date(shift.start) > now);
    
        let currentIndex = 0;
    
        const shiftSection = document.createElement('div');
        shiftSection.id = 'shift-section';
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
        });
        shiftSection.appendChild(closeButton);
    
        document.body.appendChild(shiftSection);
        

        // Add the "Update Shifts" button to the top right corner of the modal
        const updateShiftsButton = createButton('Update Shifts', '#007bff', () => {
            showShiftDataInputModal('Please go to your Tanda schedule URL (https://my.tanda.co/staff), click on your name / Attendance points / Schedules, copy all the content, and paste it here:', (tandaData) => {
                if (tandaData) {
                    const parsedEvents = parseEvents(tandaData);
                    localStorage.setItem('parsedTandaScheduleData', JSON.stringify(parsedEvents));
                    location.reload(); // Reload the page to update the shift info
                }
            });
        });
        updateShiftsButton.style.cssText += `
            position: absolute;
            top: 10px;
            right: 10px;
            width: 100px; /* Make the button smaller */
            padding: 2px; /* Adjust padding */
        `;
        shiftSection.appendChild(updateShiftsButton);
    
        function renderShifts() {
            const shiftsToRender = currentAndNextShifts.slice(0, currentIndex + displayedShifts);
            console.log('Rendered Shifts:', shiftsToRender); // Debugging log
            shiftInfo.innerHTML = `
                <strong>Current / Next Shifts in local time | <a href="https://calendar.google.com/calendar/u/0/r?pli=1" target="_blank">Google Calendar</a></strong><br>
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
                    return formatShiftRow(shift, isHighlighted);
                }).join('')}
            </tbody>
        `;
        return table.outerHTML;
    }

    function formatShiftRow(shift, isHighlighted) {
        const borderStyle = isHighlighted ? 'border: 2px solid yellow !important;' : 'border: 1px solid #ccc;';
        const rowHeight = '50px'; // Set a fixed height for the rows
    
        const startTime = new Date(shift.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const startDate = new Date(shift.start).toLocaleDateString();
        const endTime = new Date(shift.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endDate = new Date(shift.end).toLocaleDateString();
    
        return `
            <tr style="${borderStyle} height: ${rowHeight};">
                <td style="padding: 8px; border: 1px solid #ccc; max-width: 200px; word-wrap: break-word; white-space: normal;">${shift.summary || 'No summary'}</td>
                <td style="padding: 8px; border: 1px solid #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${startTime}<br>
                    <span style="font-size: 12px;">${startDate}</span>
                </td>
                <td style="padding: 8px; border: 1px solid #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${endTime}<br>
                    <span style="font-size: 12px;">${endDate}</span>
                </td>
                <td style="padding: 8px; border: 1px solid #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${shift.duration}</td>
                <td style="padding: 8px; border: 1px solid #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <button class="shift-report-button" data-start="${shift.start}" data-end="${shift.end}" data-duration="${shift.duration}" style="
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
        const caseLog = JSON.parse(localStorage.getItem('sfCaseLog')) || [];
        const newSubmissionsCount = caseLog.filter(entry => entry.caseOwner === 'NEW SUBMISSIONS').length;
        const updatesCount = caseLog.filter(entry => entry.caseOwner === 'UPDATE').length;

        const totalMinutes = (new Date(end) - new Date(start)) / (1000 * 60);

        const modal = document.createElement('div');
        modal.id = 'custom-modal';
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
        });

        const customEventCheckbox = document.createElement('input');
        customEventCheckbox.type = 'checkbox';
        customEventCheckbox.id = 'customEventCheckbox';
        customEventCheckbox.style.marginRight = '10px';

        const customEventLabel = document.createElement('label');
        customEventLabel.htmlFor = 'customEventCheckbox';
        customEventLabel.innerText = 'Add custom event (Meetings, outages, etc.)';

        const customEventInput = document.createElement('input');
        customEventInput.type = 'number';
        customEventInput.id = 'customEventInput';
        customEventInput.placeholder = 'Minutes';
        customEventInput.style.cssText = `
            display: none;
            margin-top: 10px;
            width: 50%;
            padding: 5px;
            border: 1px solid #ccc;
            border-radius: 5px;
        `;

        customEventCheckbox.addEventListener('change', () => {
            if (customEventCheckbox.checked) {
                customEventInput.style.display = 'block';
            } else {
                customEventInput.style.display = 'none';
            }
            updateProductivity();
        });

        customEventInput.addEventListener('input', () => {
            updateProductivity();
        });

        // Custom multiplier checkbox and slider
        const customMultiplierCheckbox = document.createElement('input');
        customMultiplierCheckbox.type = 'checkbox';
        customMultiplierCheckbox.id = 'customMultiplierCheckbox';
        customMultiplierCheckbox.style.marginRight = '10px';

        const customMultiplierLabel = document.createElement('label');
        customMultiplierLabel.htmlFor = 'customMultiplierCheckbox';
        customMultiplierLabel.innerText = 'Custom multiplier';

        const customMultiplierSlider = document.createElement('input');
        customMultiplierSlider.type = 'range';
        customMultiplierSlider.id = 'customMultiplierSlider';
        customMultiplierSlider.min = '0.05';
        customMultiplierSlider.max = '10';
        customMultiplierSlider.step = '0.1';
        customMultiplierSlider.value = '1.5';
        customMultiplierSlider.style.cssText = `
            display: none;
            width: 100%;
            margin-top: 10px;
        `;

        const customMultiplierValue = document.createElement('span');
        customMultiplierValue.innerText = '1.5';
        customMultiplierValue.style.cssText = `
            display: none;
            margin-left: 10px;
        `;

        const customMultiplierText = document.createElement('p');
        customMultiplierText.innerText = 'Change the multiplier to meet your needs, E.G: If your updates took more time than normal for some reason set a value < 1';
        customMultiplierText.style.cssText = `
            display: none;
            font-size: 12px;
            color: gray;
            margin-top: 10px;
        `;

        customMultiplierCheckbox.addEventListener('change', () => {
            if (customMultiplierCheckbox.checked) {
                customMultiplierSlider.style.display = 'block';
                customMultiplierValue.style.display = 'inline';
                customMultiplierText.style.display = 'block';
            } else {
                customMultiplierSlider.style.display = 'none';
                customMultiplierValue.style.display = 'none';
                customMultiplierText.style.display = 'none';
            }
            updateProductivity();
        });

        customMultiplierSlider.addEventListener('input', () => {
            customMultiplierValue.innerText = customMultiplierSlider.value;
            updateProductivity();
        });

        // Convert start and end times to PST
        const startPST = new Date(start).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
        const endPST = new Date(end).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });

        modal.innerHTML = `
    <h2 style="font-size: 18px;"><strong>Shift Report</strong></h2>
    <hr>
    <p><strong>Date:</strong> ${new Date(start).toLocaleDateString()}</p>
    <p><strong>Start (PST):</strong> ${startPST}</p>
    <p><strong>End (PST):</strong> ${endPST}</p>
    <p><strong>Duration:</strong> ${duration}</p>
    <hr>
    <p id="newSubmissionsTime"><strong>Time - New submissions:</strong></p>
    <p id="updatesTime"><strong>Time - Updates:</strong></p>
    <div id="customMultiplierContainerPlaceholder"></div>
    <hr>
    <p><strong>New Submissions:</strong> ${newSubmissionsCount}</p>
    <p><strong>Updates:</strong> ${updatesCount}</p>
    <hr>
    <h3>Productivity</h3>
    <br>
    <table id="productivityTable" style="width: 100%; border-collapse: collapse;">
        <tr>
            <th style="border: 1px solid #ccc; padding: 8px;">APH (Actions per hour)</th>
            <th style="border: 1px solid #ccc; padding: 8px;">New submissions / hour</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Updates / hour</th>
        </tr>
        <tr>
            <td id="aph" style="border: 1px solid #ccc; padding: 8px;"></td>
            <td id="newSubmissionsPerHour" style="border: 1px solid #ccc; padding: 8px;"></td>
            <td id="updatesPerHour" style="border: 1px solid #ccc; padding: 8px;"></td>
        </tr>
    </table>
    <br>
`;

// Create a container for the custom multiplier elements
const customMultiplierContainer = document.createElement('div');
customMultiplierContainer.style.cssText = 'margin-top: 20px;'; // Add margin to create visual separation

// Append custom multiplier elements to the container
customMultiplierContainer.appendChild(customMultiplierCheckbox);
customMultiplierContainer.appendChild(customMultiplierLabel);
customMultiplierContainer.appendChild(customMultiplierSlider);
customMultiplierContainer.appendChild(customMultiplierValue);
customMultiplierContainer.appendChild(customMultiplierText);

// Replace the placeholder with the custom multiplier container
const placeholder = modal.querySelector('#customMultiplierContainerPlaceholder');
placeholder.replaceWith(customMultiplierContainer);



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
                const key = entry.caseOwner === 'Fab Submission Support New' ? 'New submissions' : 'Updates';
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

        modal.appendChild(customEventCheckbox);
        modal.appendChild(customEventLabel);
        modal.appendChild(customEventInput);
        modal.appendChild(copyButton);
        modal.appendChild(closeButton);



        document.body.appendChild(modal);

        function updateProductivity() {
            const customMinutes = parseInt(customEventInput.value) || 0;
            const effectiveDuration = totalMinutes - customMinutes;

            const customMultiplier = customMultiplierCheckbox.checked ? parseFloat(customMultiplierSlider.value) : 1.5;

            const { newSubmissionsTime, updatesTime } = calculateWorkTimeWithCustomMultiplier(effectiveDuration, newSubmissionsCount, updatesCount, customMultiplier);

            document.getElementById('newSubmissionsTime').innerText = `Time - New submissions: ${newSubmissionsTime} minutes`;
            document.getElementById('updatesTime').innerText = `Time - Updates: ${updatesTime} minutes`;

            const aph = (newSubmissionsCount + updatesCount) / (effectiveDuration / 60);
            const newSubmissionsPerHour = newSubmissionsCount > 0 ? newSubmissionsCount / (newSubmissionsTime / 60) : 0;
            const updatesPerHour = updatesCount > 0 ? updatesCount / (updatesTime / 60) : 0;

            document.getElementById('aph').innerText = aph.toFixed(2);
            document.getElementById('newSubmissionsPerHour').innerText = newSubmissionsPerHour.toFixed(2);
            document.getElementById('updatesPerHour').innerText = updatesPerHour.toFixed(2);
        }

        updateProductivity(); // Initial calculation
    }

    function calculateWorkTimeWithCustomMultiplier(shiftDurationMinutes, newSubmissions, updates, customMultiplier) {
        // Edge cases: No submissions or updates
        if (newSubmissions === 0) {
            return {
                newSubmissionsTime: 0,
                updatesTime: shiftDurationMinutes
            };
        }
        if (updates === 0) {
            return {
                newSubmissionsTime: shiftDurationMinutes,
                updatesTime: 0
            };
        }

        // Total cases with weight adjustment
        const weightedNewSubmissions = newSubmissions * customMultiplier;
        const totalWeightedCases = weightedNewSubmissions + updates;

        // Calculate proportional time
        const newSubmissionsTime = (shiftDurationMinutes * weightedNewSubmissions) / totalWeightedCases;
        const updatesTime = (shiftDurationMinutes * updates) / totalWeightedCases;

        return {
            newSubmissionsTime: Math.round(newSubmissionsTime),
            updatesTime: Math.round(updatesTime)
        };
    }

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
    


    function showShiftDataInputModal(message, callback) {
        const modal = document.createElement('div');
        modal.id = 'custom-modal';
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

        const messageDiv = document.createElement('div');
        messageDiv.innerHTML = message; // Use innerHTML to render HTML content
        modal.appendChild(messageDiv);

        const textarea = document.createElement('textarea');
        textarea.style.cssText = `
            width: 100%;
            height: 200px;
            margin-top: 10px;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 5px;
        `;
        modal.appendChild(textarea);

        const buttonDiv = document.createElement('div');
        buttonDiv.style.cssText = `
            margin-top: 10px;
            text-align: right;
        `;

        const submitButton = document.createElement('button');
        submitButton.innerText = 'Submit';
        submitButton.style.cssText = `
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 10px;
            cursor: pointer;
        `;
        submitButton.addEventListener('click', () => {
            callback(textarea.value);
            document.body.removeChild(modal);
        });
        buttonDiv.appendChild(submitButton);

        const cancelButton = document.createElement('button');
        cancelButton.innerText = 'Cancel';
        cancelButton.style.cssText = `
            background: #f44336;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 10px;
            cursor: pointer;
            margin-left: 10px;
        `;
        cancelButton.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        buttonDiv.appendChild(cancelButton);

        modal.appendChild(buttonDiv);
        document.body.appendChild(modal);
    }

    function getAppData() {
        const data = [];
        const info = processListingContent(); // Assuming this function returns the necessary info

        if (!info || info.length === 0) {
            console.error('No valid info found.');
            return data;
        }

        info.forEach(item => {
            const appName = item.appName;
            const distributionMethod = getDistributionMethod(item);
            const earliestUEVersion = getEarliestUEVersion(item.engineVersion);
            const targetPlatforms = getTargetPlatforms(item.targetPlatforms);
            const customEngineVersion = distributionMethod === 'CODE_PLUGIN' ? getCustomEngineVersion(earliestUEVersion) : null;

            data.push({
                appName,
                distributionMethod,
                earliestUEVersion,
                targetPlatforms,
                customEngineVersion
            });
        });

        return data;
    }

    function getDistributionMethod(item) {
        if (item.distributionMethod === 'Plugins') {
            return 'CODE_PLUGIN';
        } else if (item.distributionMethod === 'AssetPack' || item.distributionMethod === 'CompleteProject') {
            return 'ASSET_PACK';
        } else {
            return 'COMPLETE_PROJECT';
        }
    }

    function getEarliestUEVersion(engineVersion) {
        const versions = engineVersion.split(';').map(v => v.replace('UE_', ''));
        return versions.sort()[0];
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
            console.error("Could not find the 'Listing Content' section.");
            alert("Could not find the 'Listing Content' section.");
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

    observePageContent(); // Start observing the page
})();
