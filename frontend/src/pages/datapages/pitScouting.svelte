<script>
    import { onMount } from "svelte";

    // Form data
    let formData = {
        teamNumber: "",
        throughTrench: null,
        overBump: null,
        climbLevels: "",
        climbDuringAuto: null,
        quantityBallsHopper: "",
        avgIntakeSpeed: "",
        avgShootSpeed: "",
        accuracy: "",
        framesize: "",
        canUseHP: null,
        canUseDepot: null,
        canFeed: null,
        startingHeight: "",
        fullExtensionHeight: "",
        robotPicture: null,
        robotPicturePreview: null
    };

    let submitting = false;
    let submitMessage = "";
    let submitError = false;

    function handleInput(field, event) {
        formData[field] = event.target.value;
        formData = formData; // Force reactivity
    }

    function setBooleanField(field, value) {
        formData[field] = value;
        formData = formData; // Force reactivity
    }

    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
            formData.robotPicture = file;
            // Create preview
            const reader = new FileReader();
            reader.onload = (e) => {
                formData.robotPicturePreview = e.target.result;
                formData = formData; // Force reactivity
            };
            reader.readAsDataURL(file);
        }
    }

    function clearForm() {
        formData = {
            teamNumber: "",
            throughTrench: null,
            overBump: null,
            climbLevels: "",
            climbDuringAuto: null,
            quantityBallsHopper: "",
            avgIntakeSpeed: "",
            avgShootSpeed: "",
            accuracy: "",
            framesize: "",
            canUseHP: null,
            canUseDepot: null,
            canFeed: null,
            startingHeight: "",
            fullExtensionHeight: "",
            robotPicture: null,
            robotPicturePreview: null
        };
        
        // Reset file input
        const fileInput = document.getElementById('robot-picture');
        if (fileInput) fileInput.value = '';
        
        // Reset all text inputs
        document.querySelectorAll('input[type="text"]').forEach(input => input.value = '');
        document.querySelectorAll('select').forEach(select => select.value = '');
    }

    async function handleSubmit() {
        // Validation
        if (!formData.teamNumber) {
            submitMessage = "Please enter a team number";
            submitError = true;
            return;
        }

        submitting = true;
        submitMessage = "";
        submitError = false;

        try {
            const apiFormData = new FormData();
            
            // Add all form fields
            apiFormData.append('team', formData.teamNumber);
            apiFormData.append('through_trench', formData.throughTrench === true ? 'Y' : formData.throughTrench === false ? 'N' : '');
            apiFormData.append('over_bump', formData.overBump === true ? 'Y' : formData.overBump === false ? 'N' : '');
            apiFormData.append('climb_levels', formData.climbLevels);
            apiFormData.append('climb_during_auto', formData.climbDuringAuto === true ? 'Y' : formData.climbDuringAuto === false ? 'N' : '');
            apiFormData.append('quantity_balls_hopper', formData.quantityBallsHopper);
            apiFormData.append('avg_intake_speed', formData.avgIntakeSpeed);
            apiFormData.append('avg_shoot_speed', formData.avgShootSpeed);
            apiFormData.append('accuracy', formData.accuracy);
            apiFormData.append('framesize', formData.framesize);
            apiFormData.append('can_use_hp', formData.canUseHP === true ? 'Y' : formData.canUseHP === false ? 'N' : '');
            apiFormData.append('can_use_depot', formData.canUseDepot === true ? 'Y' : formData.canUseDepot === false ? 'N' : '');
            apiFormData.append('can_feed', formData.canFeed === true ? 'Y' : formData.canFeed === false ? 'N' : '');
            apiFormData.append('starting_height', formData.startingHeight);
            apiFormData.append('full_extension_height', formData.fullExtensionHeight);
            
            if (formData.robotPicture) {
                apiFormData.append('robot_picture', formData.robotPicture);
            }

            const response = await fetch('http://localhost:8000/pitScouting', {
                method: 'POST',
                body: apiFormData
            });

            if (response.ok) {
                submitMessage = "✓ Pit scouting data submitted successfully!";
                submitError = false;
                clearForm();
                setTimeout(() => {
                    submitMessage = "";
                }, 3000);
            } else {
                const error = await response.text();
                submitMessage = `Error: ${error}`;
                submitError = true;
            }
        } catch (error) {
            console.error('Submission error:', error);
            submitMessage = `Error: ${error.message}`;
            submitError = true;
        } finally {
            submitting = false;
        }
    }
</script>

<div class="mobile-container">
    <!-- Header -->
    <div class="header">
        <h1>Pit Scouting</h1>
        <p class="subtitle">FRC Team 190</p>
    </div>

    <!-- Form -->
    <div class="form-container">
        {#if submitMessage}
            <div class="message {submitError ? 'error' : 'success'}">
                {submitMessage}
            </div>
        {/if}

        <!-- Team Information -->
        <div class="form-section">
            <h2 class="section-title">Team Information</h2>
            
            <div class="form-group">
                <label for="team-number">Team Number</label>
                <input
                    type="text"
                    id="team-number"
                    value={formData.teamNumber}
                    on:input={(e) => handleInput('teamNumber', e)}
                    placeholder="Enter team number"
                />
            </div>
        </div>

        <!-- Mobility -->
        <div class="form-section">
            <h2 class="section-title">Mobility</h2>
            
            <div class="form-group">
                <label>Under Trench</label>
                <div class="bool-toggle">
                    <button
                        type="button"
                        class="bool-btn {formData.throughTrench === true ? 'selected-yes' : ''}"
                        on:click={() => setBooleanField('throughTrench', true)}
                    >
                        Yes
                    </button>
                    <button
                        type="button"
                        class="bool-btn {formData.throughTrench === false ? 'selected-no' : ''}"
                        on:click={() => setBooleanField('throughTrench', false)}
                    >
                        No
                    </button>
                </div>
            </div>

            <div class="form-group">
                <label>Over Bump</label>
                <div class="bool-toggle">
                    <button
                        type="button"
                        class="bool-btn {formData.overBump === true ? 'selected-yes' : ''}"
                        on:click={() => setBooleanField('overBump', true)}
                    >
                        Yes
                    </button>
                    <button
                        type="button"
                        class="bool-btn {formData.overBump === false ? 'selected-no' : ''}"
                        on:click={() => setBooleanField('overBump', false)}
                    >
                        No
                    </button>
                </div>
            </div>
        </div>

        <!-- Climbing -->
        <div class="form-section">
            <h2 class="section-title">Climbing</h2>
            
            <div class="form-group">
                <label for="climb-levels">Climb Levels <span class="label-helper">(Didn't Climb, 1, 2, or 3)</span></label>
                <select 
                    id="climb-levels" 
                    value={formData.climbLevels}
                    on:change={(e) => handleInput('climbLevels', e)}
                >
                    <option value="">Select level</option>
                    <option value="0">Doesn't Climb</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                </select>
            </div>

            <div class="form-group">
                <label>Climb during Auto</label>
                <div class="bool-toggle">
                    <button
                        type="button"
                        class="bool-btn {formData.climbDuringAuto === true ? 'selected-yes' : ''}"
                        on:click={() => setBooleanField('climbDuringAuto', true)}
                    >
                        Yes
                    </button>
                    <button
                        type="button"
                        class="bool-btn {formData.climbDuringAuto === false ? 'selected-no' : ''}"
                        on:click={() => setBooleanField('climbDuringAuto', false)}
                    >
                        No
                    </button>
                </div>
            </div>
        </div>

        <!-- Game Piece Handling -->
        <div class="form-section">
            <h2 class="section-title">Game Piece Handling</h2>
            
            <div class="form-group">
                <label for="balls-hopper">Quantity of Balls in Hopper</label>
                <input
                    type="text"
                    id="balls-hopper"
                    value={formData.quantityBallsHopper}
                    on:input={(e) => handleInput('quantityBallsHopper', e)}
                    placeholder="Enter quantity"
                />
            </div>

            <div class="form-group">
                <label for="intake-speed">Avg Intake Speed <span class="label-helper">(per second)</span></label>
                <input
                    type="text"
                    id="intake-speed"
                    value={formData.avgIntakeSpeed}
                    on:input={(e) => handleInput('avgIntakeSpeed', e)}
                    placeholder="Enter speed"
                />
            </div>

            <div class="form-group">
                <label for="shoot-speed">Avg Shoot Speed <span class="label-helper">(per second)</span></label>
                <input
                    type="text"
                    id="shoot-speed"
                    value={formData.avgShootSpeed}
                    on:input={(e) => handleInput('avgShootSpeed', e)}
                    placeholder="Enter speed"
                />
            </div>

            <div class="form-group">
                <label for="accuracy">Accuracy <span class="label-helper">(percentage)</span></label>
                <input
                    type="text"
                    id="accuracy"
                    value={formData.accuracy}
                    on:input={(e) => handleInput('accuracy', e)}
                    placeholder="Enter accuracy %"
                />
            </div>
        </div>

        <!-- Robot Specifications -->
        <div class="form-section">
            <h2 class="section-title">Robot Specifications</h2>
            
            <div class="form-group">
                <label for="framesize">Framesize <span class="label-helper">(inches)</span></label>
                <input
                    type="text"
                    id="framesize"
                    value={formData.framesize}
                    on:input={(e) => handleInput('framesize', e)}
                    placeholder="Enter framesize"
                />
            </div>

            <div class="form-group">
                <label for="starting-height">Starting Height <span class="label-helper">(inches)</span></label>
                <input
                    type="text"
                    id="starting-height"
                    value={formData.startingHeight}
                    on:input={(e) => handleInput('startingHeight', e)}
                    placeholder="Enter starting height"
                />
            </div>

            <div class="form-group">
                <label for="extension-height">Full Extension Height <span class="label-helper">(inches)</span></label>
                <input
                    type="text"
                    id="extension-height"
                    value={formData.fullExtensionHeight}
                    on:input={(e) => handleInput('fullExtensionHeight', e)}
                    placeholder="Enter full extension height"
                />
            </div>
        </div>

        <!-- Capabilities -->
        <div class="form-section">
            <h2 class="section-title">Capabilities</h2>
            
            <div class="form-group">
                <label>Can Use HP (Human Player)</label>
                <div class="bool-toggle">
                    <button
                        type="button"
                        class="bool-btn {formData.canUseHP === true ? 'selected-yes' : ''}"
                        on:click={() => setBooleanField('canUseHP', true)}
                    >
                        Yes
                    </button>
                    <button
                        type="button"
                        class="bool-btn {formData.canUseHP === false ? 'selected-no' : ''}"
                        on:click={() => setBooleanField('canUseHP', false)}
                    >
                        No
                    </button>
                </div>
            </div>

            <div class="form-group">
                <label>Can Use Depot</label>
                <div class="bool-toggle">
                    <button
                        type="button"
                        class="bool-btn {formData.canUseDepot === true ? 'selected-yes' : ''}"
                        on:click={() => setBooleanField('canUseDepot', true)}
                    >
                        Yes
                    </button>
                    <button
                        type="button"
                        class="bool-btn {formData.canUseDepot === false ? 'selected-no' : ''}"
                        on:click={() => setBooleanField('canUseDepot', false)}
                    >
                        No
                    </button>
                </div>
            </div>

            <div class="form-group">
                <label>Can Feed</label>
                <div class="bool-toggle">
                    <button
                        type="button"
                        class="bool-btn {formData.canFeed === true ? 'selected-yes' : ''}"
                        on:click={() => setBooleanField('canFeed', true)}
                    >
                        Yes
                    </button>
                    <button
                        type="button"
                        class="bool-btn {formData.canFeed === false ? 'selected-no' : ''}"
                        on:click={() => setBooleanField('canFeed', false)}
                    >
                        No
                    </button>
                </div>
            </div>
        </div>

        <!-- Robot Picture -->
        <div class="form-section">
            <h2 class="section-title">Robot Picture</h2>
            
            <div class="form-group">
                <div class="file-upload-wrapper">
                    <label
                        for="robot-picture"
                        class="file-upload-label {formData.robotPicture ? 'has-file' : ''}"
                    >
                        <div class="upload-icon">📷</div>
                        <div class="upload-text">
                            {formData.robotPicture ? formData.robotPicture.name : 'Click to upload photo'}
                        </div>
                    </label>
                    <input
                        type="file"
                        id="robot-picture"
                        accept="image/png,image/jpeg,image/jpg"
                        on:change={handleFileUpload}
                    />
                </div>

                {#if formData.robotPicturePreview}
                    <div class="image-preview">
                        <img src={formData.robotPicturePreview} alt="Robot preview" />
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <!-- Submit Section -->
    <div class="submit-section">
        <button
            type="button"
            class="submit-btn"
            on:click={handleSubmit}
            disabled={submitting}
        >
            {#if submitting}
                <span class="spinner"></span>
                Submitting...
            {:else}
                Submit Pit Scouting
            {/if}
        </button>
        
        <button
            type="button"
            class="clear-btn"
            on:click={clearForm}
            disabled={submitting}
        >
            Clear Form
        </button>
    </div>
</div>

<style>
    /* FRC 190 Brand Colors */
    :root {
        --frc-190-red: #C81B00;
        --wpi-gray: #A9B0B7;
        --frc-190-black: #4D4D4D;
    }

    :global(html), :global(body) {
        margin: 0;
        padding: 0;
        background: var(--wpi-gray);
        height: 100%;
        width: 100%;
        overflow-x: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    }

    :global(*) {
        box-sizing: border-box;
    }

    .mobile-container {
        min-height: 100vh;
        background: var(--wpi-gray);
        padding: 0;
    }

    .header {
        background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
        color: white;
        padding: 20px;
        text-align: center;
        border-bottom: 3px solid var(--frc-190-red);
        position: sticky;
        top: 0;
        z-index: 100;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }

    .header h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 800;
        color: var(--frc-190-red);
        text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
    }

    .header .subtitle {
        margin: 5px 0 0 0;
        font-size: 0.9rem;
        color: #ddd;
        font-weight: 400;
    }

    .form-container {
        padding: 20px;
        max-width: 600px;
        margin: 0 auto;
    }

    .form-section {
        background: white;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .section-title {
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--frc-190-red);
        margin: 0 0 15px 0;
        padding-bottom: 10px;
        border-bottom: 2px solid var(--frc-190-red);
    }

    .form-group {
        margin-bottom: 20px;
    }

    .form-group:last-child {
        margin-bottom: 0;
    }

    label {
        display: block;
        font-weight: 600;
        color: var(--frc-190-black);
        margin-bottom: 8px;
        font-size: 0.95rem;
    }

    .label-helper {
        font-weight: 400;
        color: #666;
        font-size: 0.85rem;
        margin-left: 5px;
    }

    input[type="text"],
    input[type="number"],
    select {
        width: 100%;
        padding: 12px 15px;
        font-size: 16px;
        border: 2px solid #ddd;
        border-radius: 8px;
        background: white;
        color: #333;
        transition: border-color 0.3s ease;
        -webkit-appearance: none;
        appearance: none;
    }

    input[type="text"]:focus,
    input[type="number"]:focus,
    select:focus {
        outline: none;
        border-color: var(--frc-190-red);
        box-shadow: 0 0 0 3px rgba(200, 27, 0, 0.1);
    }

    select {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23333' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 12px center;
        padding-right: 35px;
    }

    /* Boolean Toggle Buttons */
    .bool-toggle {
        display: flex;
        gap: 10px;
        width: 100%;
    }

    .bool-btn {
        flex: 1;
        padding: 12px;
        font-size: 16px;
        font-weight: 600;
        border: 2px solid #ddd;
        border-radius: 8px;
        background: white;
        color: var(--frc-190-black);
        cursor: pointer;
        transition: all 0.3s ease;
        text-align: center;
    }

    .bool-btn:active {
        transform: scale(0.98);
    }

    .bool-btn.selected-yes {
        background: #4CAF50;
        color: white;
        border-color: #4CAF50;
    }

    .bool-btn.selected-no {
        background: #f44336;
        color: white;
        border-color: #f44336;
    }

    .bool-btn:not(.selected-yes):not(.selected-no):hover {
        border-color: var(--frc-190-red);
        background: rgba(200, 27, 0, 0.05);
    }

    /* File Upload */
    .file-upload-wrapper {
        position: relative;
    }

    .file-upload-label {
        display: block;
        padding: 15px;
        border: 2px dashed #ddd;
        border-radius: 8px;
        text-align: center;
        cursor: pointer;
        transition: all 0.3s ease;
        background: white;
    }

    .file-upload-label:hover {
        border-color: var(--frc-190-red);
        background: rgba(200, 27, 0, 0.02);
    }

    .file-upload-label.has-file {
        border-style: solid;
        border-color: var(--frc-190-red);
        background: rgba(200, 27, 0, 0.05);
    }

    input[type="file"] {
        position: absolute;
        width: 0;
        height: 0;
        opacity: 0;
    }

    .upload-icon {
        font-size: 2rem;
        color: var(--frc-190-red);
        margin-bottom: 5px;
    }

    .upload-text {
        font-size: 0.9rem;
        color: #666;
    }

    .image-preview {
        margin-top: 15px;
        border-radius: 8px;
        overflow: hidden;
        border: 2px solid var(--frc-190-red);
    }

    .image-preview img {
        width: 100%;
        height: auto;
        display: block;
    }

    /* Submit Button */
    .submit-section {
        padding: 20px;
        position: sticky;
        bottom: 0;
        background: var(--wpi-gray);
        border-top: 2px solid #ddd;
    }

    .submit-btn {
        width: 100%;
        padding: 16px;
        font-size: 1.1rem;
        font-weight: 700;
        color: white;
        background: linear-gradient(135deg, var(--frc-190-red) 0%, #a01500 100%);
        border: none;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(200, 27, 0, 0.3);
        text-transform: uppercase;
        letter-spacing: 1px;
    }

    .submit-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(200, 27, 0, 0.4);
    }

    .submit-btn:active:not(:disabled) {
        transform: translateY(0);
    }

    .submit-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .clear-btn {
        width: 100%;
        padding: 12px;
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--frc-190-black);
        background: white;
        border: 2px solid #ddd;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s ease;
        margin-top: 10px;
    }

    .clear-btn:hover {
        border-color: var(--frc-190-red);
        background: rgba(200, 27, 0, 0.05);
    }

    /* Message */
    .message {
        padding: 12px 15px;
        border-radius: 8px;
        margin-bottom: 15px;
        font-weight: 600;
        text-align: center;
    }

    .message.success {
        background: #d4edda;
        color: #155724;
        border: 2px solid #c3e6cb;
    }

    .message.error {
        background: #f8d7da;
        color: #721c24;
        border: 2px solid #f5c6cb;
    }

    /* Loading Spinner */
    .spinner {
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 3px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top-color: white;
        animation: spin 0.8s linear infinite;
        margin-right: 10px;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    /* Desktop optimizations */
    @media (min-width: 768px) {
        .form-container {
            padding: 30px;
        }
        
        .header h1 {
            font-size: 2rem;
        }
        
        .submit-section {
            position: relative;
            max-width: 600px;
            margin: 0 auto;
        }
    }

    /* Mobile adjustments */
    @media (max-width: 400px) {
        .header h1 {
            font-size: 1.3rem;
        }
        
        .form-container {
            padding: 15px;
        }
        
        .form-section {
            padding: 15px;
        }
    }
</style>