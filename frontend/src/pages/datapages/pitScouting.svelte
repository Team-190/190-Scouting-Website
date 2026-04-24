<script lang="ts">
    import { onMount } from "svelte";
    import {
        fetchTeams,
        flushPitScoutingQueue,
        queuePitScoutingForSync,
        readPitScoutingFromIDB,
    } from "../../utils/api";
    import { compressImage, formatBytes, getBase64Size } from "../../utils/imageCompression";
    import { getEventCode } from "../../utils/pageUtils";

    const boolFields = ["overBump", "throughTrench", "climbDuringAuto", "canUseHP", "canUseDepot", "canFeed"] as const;
    const plainFields = ["climbLevels", "quantityBallsHopper", "avgIntakeSpeed", "avgShootSpeed", "accuracy", "framesize", "startingHeight", "fullExtensionHeight"] as const;

    // Form data
    const defaultFormData = {
        teamNumber: "",
        ...Object.fromEntries(boolFields.map(f => [f, null])) as Record<typeof boolFields[number], null>,
        ...Object.fromEntries(plainFields.map(f => [f, ""])) as Record<typeof plainFields[number], string>,
        robotPicture: null,
        robotPicturePreview: null,
        otherNotes: "",
    };

    let formData = structuredClone(defaultFormData);
    let imageCompressionStatus = ""; // "compressing", "success", "done"
    let imageSize = ""; // Display compressed image size

    let submitting = false;
    let submitStatus: { type: "server" | "local" | "partial" | "error"; message: string } | null = null;

    let fileInputNode;

    const eventCode = getEventCode();

    let selectedTeam = "Select a team";
    let allTeams = [];

    onMount(async () => {
        const { _teamNumbers } = await fetchTeams(eventCode);
        console.log("_teamNumbers sample:", _teamNumbers[0]);
        
        const retrievePit = await readPitScoutingFromIDB({});
        const pitScouting = JSON.parse(localStorage.getItem("pitScouting") || "[]");
        
        const scoutedTeams = new Set([
            ...Object.keys(retrievePit),
            ...pitScouting.map(entry => String(entry.team ?? entry.teamNumber ?? ""))
        ]);
        
        allTeams = _teamNumbers.map(team => ({
            number: team,
            hasData: scoutedTeams.has(String(team))
        }));
    });

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
            imageCompressionStatus = "compressing";
            imageSize = "";
            
            // Compress the image
            compressImage(file)
                .then((compressedDataUrl) => {
                    formData.robotPicturePreview = compressedDataUrl;
                    const sizeInBytes = getBase64Size(compressedDataUrl);
                    imageSize = formatBytes(sizeInBytes);
                    imageCompressionStatus = "done";
                    formData = formData; // Force reactivity
                })
                .catch((error) => {
                    console.error("Image compression failed:", error);
                    imageCompressionStatus = "error";
                    submitStatus = { type: "error", message: "Failed to compress image. Please try another file." };
                    setTimeout(() => { submitStatus = null; }, 3000);
                });
        }
    }

    function clearForm() {
        formData = structuredClone(defaultFormData);
        imageCompressionStatus = "";
        imageSize = "";

        // Reset file input safely via bind:this
        if (fileInputNode) fileInputNode.value = "";
    }

    async function handleSubmit() {
        if (!selectedTeam || selectedTeam === "Select a team") {
            submitStatus = { type: "error", message: "Please select a team number." };
            return;
        }

        submitting = true;

        // Helper to convert boolean to Y/N
        const boolToYN = (val) => val === true ? "Y" : val === false ? "N" : "";

        const apiFormData = {
            teamNumber: selectedTeam,
            ...Object.fromEntries(boolFields.map(f => [f, boolToYN(formData[f])])),
            ...Object.fromEntries(plainFields.map(f => [f, formData[f]])),
        };

        const apiFormDataWithImage = {
            ...apiFormData,
            ...(formData.robotPicture
                ? { robotPicturePreview: formData.robotPicturePreview }
                : { robotPicturePreview: "" })
        };

        await queuePitScoutingForSync(eventCode, selectedTeam, apiFormDataWithImage);

        allTeams = allTeams.map((team) =>
            String(team.number) === String(selectedTeam)
                ? { ...team, hasData: true }
                : team
        );

        const result = await flushPitScoutingQueue();
        if (result.remaining === 0 && result.uploaded > 0) {
            submitStatus = { type: "server", message: `✓ Success! Team ${selectedTeam} pit scouting data uploaded.` };
        } else if (result.uploaded > 0) {
            submitStatus = { type: "partial", message: `✓ Saved! ${result.uploaded} record(s) uploaded, ${result.remaining} saved offline. Will sync automatically.` };
        } else {
            submitStatus = { type: "local", message: `✓ Data saved. Will upload when connection is restored.` };
        }
        clearForm();
        submitting = false;
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
        {#if submitStatus}
            <div class="push-status {submitStatus.type}">
                <span class="push-label">Data destination</span>
                <span class="push-message">{submitStatus.message}</span>
            </div>
        {/if}

        <!-- Team Information -->
        <div class="form-section">
            <h2 class="section-title">Team Information</h2>

            <div class="form-group">
                <label for="team-number">Team Number</label>

                <select id="teams" name="teams" bind:value={selectedTeam}>
                    <option value="Select a team">Select a team</option>
                    {#each allTeams as team}
                        <option value={team.number}>{team.number}{team.hasData ? "  ✅" : ""}</option>
                    {/each}
                </select>
            </div>
        </div>

        <!-- Mobility -->
        <div class="form-section">
            <h2 class="section-title">Mobility</h2>

            <div class="form-group">
                <span class="field-label">Under Trench</span>
                <div class="bool-toggle">
                    <button
                        type="button"
                        class="bool-btn {formData.throughTrench === true
                            ? 'selected-yes'
                            : ''}"
                        on:click={() => setBooleanField("throughTrench", true)}
                    >
                        Yes
                    </button>
                    <button
                        type="button"
                        class="bool-btn {formData.throughTrench === false
                            ? 'selected-no'
                            : ''}"
                        on:click={() => setBooleanField("throughTrench", false)}
                    >
                        No
                    </button>
                </div>
            </div>

            <div class="form-group">
                <span class="field-label">Over Bump</span>
                <div class="bool-toggle">
                    <button
                        type="button"
                        class="bool-btn {formData.overBump === true
                            ? 'selected-yes'
                            : ''}"
                        on:click={() => setBooleanField("overBump", true)}
                    >
                        Yes
                    </button>
                    <button
                        type="button"
                        class="bool-btn {formData.overBump === false
                            ? 'selected-no'
                            : ''}"
                        on:click={() => setBooleanField("overBump", false)}
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
                <label for="climb-levels"
                    >Climb Levels <span class="label-helper"
                        >(Didn't Climb, 1, 2, or 3)</span
                    ></label
                >
                <select
                    id="climb-levels"
                    value={formData.climbLevels}
                    on:change={(e) => handleInput("climbLevels", e)}
                >
                    <option value="">Select level</option>
                    <option value="0">Doesn't Climb</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                </select>
            </div>

            <div class="form-group">
                <span class="field-label">Climb during Auto</span>
                <div class="bool-toggle">
                    <button
                        type="button"
                        class="bool-btn {formData.climbDuringAuto === true
                            ? 'selected-yes'
                            : ''}"
                        on:click={() =>
                            setBooleanField("climbDuringAuto", true)}
                    >
                        Yes
                    </button>
                    <button
                        type="button"
                        class="bool-btn {formData.climbDuringAuto === false
                            ? 'selected-no'
                            : ''}"
                        on:click={() =>
                            setBooleanField("climbDuringAuto", false)}
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
                    on:input={(e) => handleInput("quantityBallsHopper", e)}
                    placeholder="Enter quantity"
                />
            </div>

            <div class="form-group">
                <label for="intake-speed"
                    >Avg Intake Speed <span class="label-helper"
                        >(per second)</span
                    ></label
                >
                <input
                    type="text"
                    id="intake-speed"
                    value={formData.avgIntakeSpeed}
                    on:input={(e) => handleInput("avgIntakeSpeed", e)}
                    placeholder="Enter speed"
                />
            </div>

            <div class="form-group">
                <label for="shoot-speed"
                    >Avg Shoot Speed <span class="label-helper"
                        >(per second)</span
                    ></label
                >
                <input
                    type="text"
                    id="shoot-speed"
                    value={formData.avgShootSpeed}
                    on:input={(e) => handleInput("avgShootSpeed", e)}
                    placeholder="Enter speed"
                />
            </div>

            <div class="form-group">
                <label for="accuracy"
                    >Accuracy <span class="label-helper">(percentage)</span
                    ></label
                >
                <input
                    type="text"
                    id="accuracy"
                    value={formData.accuracy}
                    on:input={(e) => handleInput("accuracy", e)}
                    placeholder="Enter accuracy %"
                />
            </div>
        </div>

        <!-- Robot Specifications -->
        <div class="form-section">
            <h2 class="section-title">Robot Specifications</h2>

            <div class="form-group">
                <label for="framesize"
                    >Framesize <span class="label-helper">(inches)</span></label
                >
                <input
                    type="text"
                    id="framesize"
                    value={formData.framesize}
                    on:input={(e) => handleInput("framesize", e)}
                    placeholder="Enter framesize"
                />
            </div>

            <div class="form-group">
                <label for="starting-height"
                    >Starting Height <span class="label-helper">(inches)</span
                    ></label
                >
                <input
                    type="text"
                    id="starting-height"
                    value={formData.startingHeight}
                    on:input={(e) => handleInput("startingHeight", e)}
                    placeholder="Enter starting height"
                />
            </div>

            <div class="form-group">
                <label for="extension-height"
                    >Full Extension Height <span class="label-helper"
                        >(inches)</span
                    ></label
                >
                <input
                    type="text"
                    id="extension-height"
                    value={formData.fullExtensionHeight}
                    on:input={(e) => handleInput("fullExtensionHeight", e)}
                    placeholder="Enter full extension height"
                />
            </div>
        </div>

        <!-- Capabilities -->
        <div class="form-section">
            <h2 class="section-title">Capabilities</h2>

            <div class="form-group">
                <span class="field-label">Can Use HP (Human Player)</span>
                <div class="bool-toggle">
                    <button
                        type="button"
                        class="bool-btn {formData.canUseHP === true
                            ? 'selected-yes'
                            : ''}"
                        on:click={() => setBooleanField("canUseHP", true)}
                    >
                        Yes
                    </button>
                    <button
                        type="button"
                        class="bool-btn {formData.canUseHP === false
                            ? 'selected-no'
                            : ''}"
                        on:click={() => setBooleanField("canUseHP", false)}
                    >
                        No
                    </button>
                </div>
            </div>

            <div class="form-group">
                <span class="field-label">Can Use Depot</span>
                <div class="bool-toggle">
                    <button
                        type="button"
                        class="bool-btn {formData.canUseDepot === true
                            ? 'selected-yes'
                            : ''}"
                        on:click={() => setBooleanField("canUseDepot", true)}
                    >
                        Yes
                    </button>
                    <button
                        type="button"
                        class="bool-btn {formData.canUseDepot === false
                            ? 'selected-no'
                            : ''}"
                        on:click={() => setBooleanField("canUseDepot", false)}
                    >
                        No
                    </button>
                </div>
            </div>

            <div class="form-group">
                <span class="field-label">Can Feed</span>
                <div class="bool-toggle">
                    <button
                        type="button"
                        class="bool-btn {formData.canFeed === true
                            ? 'selected-yes'
                            : ''}"
                        on:click={() => setBooleanField("canFeed", true)}
                    >
                        Yes
                    </button>
                    <button
                        type="button"
                        class="bool-btn {formData.canFeed === false
                            ? 'selected-no'
                            : ''}"
                        on:click={() => setBooleanField("canFeed", false)}
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
                        class="file-upload-label {formData.robotPicture
                            ? 'has-file'
                            : ''} {imageCompressionStatus === 'compressing' ? 'compressing' : ''}"
                    >
                        <div class="upload-icon">
                            {#if imageCompressionStatus === 'compressing'}
                                <span class="compress-spinner">⏳</span>
                            {:else}
                                📷
                            {/if}
                        </div>
                        <div class="upload-text">
                            {#if imageCompressionStatus === 'compressing'}
                                Compressing image...
                            {:else if formData.robotPicture}
                                {formData.robotPicture.name}
                                {#if imageSize}
                                    <div class="size-info">Compressed: {imageSize}</div>
                                {/if}
                            {:else}
                                Click to upload photo
                            {/if}
                        </div>
                    </label>
                    <input
                        type="file"
                        id="robot-picture"
                        bind:this={fileInputNode}
                        accept="image/*"
                        capture="environment"
                        on:change={handleFileUpload}
                    />
                </div>

                {#if formData.robotPicturePreview}
                    <div class="image-preview">
                        <img
                            src={formData.robotPicturePreview}
                            alt="Robot preview"
                        />
                    </div>
                {/if}
            </div>
        </div>
    <!-- Other Notes -->
            <div class="form-section">
                <h2 class="section-title">Other Notes</h2>

                <div class="form-group">
                    <label for="other-notes">Additional observations about the team</label>
                    <input
                        type="text"
                        id="other-notes"
                        value={formData.otherNotes}
                        on:input={(e) => handleInput("otherNotes", e)}
                        placeholder="Enter any additional notes or observations about this team"
                    />
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
        --frc-190-red: #c81b00;
        --wpi-gray: #a9b0b7;
        --frc-190-black: #4d4d4d;
    }

    :global(html),
    :global(body) {
        margin: 0;
        padding: 0;
        background: var(--wpi-gray);
        height: 100%;
        width: 100%;
        overflow-x: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            Oxygen, Ubuntu, Cantarell, sans-serif;
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
        padding: 1.5rem;
        text-align: center;
        border-bottom: 3px solid var(--frc-190-red);
        position: sticky;
        top: 0;
        z-index: 100;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }

    .header h1 {
        margin: 0;
        font-size: 1.3rem;
        font-weight: 800;
        color: var(--frc-190-red);
        text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
    }

    .header .subtitle {
        margin: 0.3rem 0 0 0;
        font-size: 0.85rem;
        color: #ddd;
        font-weight: 400;
    }

    .form-container {
        padding: 1.5rem;
        max-width: 600px;
        margin: 0 auto;
    }

    .form-section {
        background: white;
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .section-title {
        font-size: 1rem;
        font-weight: 700;
        color: var(--frc-190-red);
        margin: 0 0 1rem 0;
        padding-bottom: 0.75rem;
        border-bottom: 2px solid var(--frc-190-red);
    }

    .form-group {
        margin-bottom: 1.5rem;
    }

    .form-group:last-child {
        margin-bottom: 0;
    }

    label,
    .field-label {
        display: block;
        font-weight: 600;
        color: var(--frc-190-black);
        margin-bottom: 0.6rem;
        font-size: 0.9rem;
    }

    .label-helper {
        font-weight: 400;
        color: #666;
        font-size: 0.8rem;
        margin-left: 0.4rem;
    }

    input[type="text"],
    select {
        width: 100%;
        padding: 0.9rem 1rem;
        font-size: 1rem;
        border: 2px solid #ddd;
        border-radius: 8px;
        background: white;
        color: #333;
        transition: border-color 0.3s ease;
        -webkit-appearance: none;
        appearance: none;
    }

    input[type="text"]:focus,
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
        gap: 0.75rem;
        width: 100%;
    }

    .bool-btn {
        flex: 1;
        padding: 0.9rem;
        font-size: 0.95rem;
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
        background: #4caf50;
        color: white;
        border-color: #4caf50;
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
        padding: 1.25rem;
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

    .file-upload-label.compressing {
        opacity: 0.7;
        border-color: #ffa500;
        background: rgba(255, 165, 0, 0.05);
    }

    input[type="file"] {
        position: absolute;
        width: 0;
        height: 0;
        opacity: 0;
    }

    .upload-icon {
        font-size: 1.75rem;
        color: var(--frc-190-red);
        margin-bottom: 0.4rem;
    }

    .upload-text {
        font-size: 0.85rem;
        color: #666;
    }

    .size-info {
        font-size: 0.75rem;
        color: #999;
        margin-top: 0.4rem;
        font-weight: 500;
    }

    .compress-spinner {
        display: inline-block;
        animation: bounce 1.5s infinite;
    }

    @keyframes bounce {
        0%, 100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(-4px);
        }
    }

    .image-preview {
        margin-top: 1rem;
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
        padding: 1.5rem;
        position: sticky;
        bottom: 0;
        background: var(--wpi-gray);
        border-top: 2px solid #ddd;
    }

    .submit-btn {
        width: 100%;
        padding: 1.2rem;
        font-size: 1rem;
        font-weight: 700;
        color: white;
        background: linear-gradient(
            135deg,
            var(--frc-190-red) 0%,
            #a01500 100%
        );
        border: none;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(200, 27, 0, 0.3);
        text-transform: uppercase;
        letter-spacing: 0.5px;
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
        padding: 0.9rem;
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--frc-190-black);
        background: white;
        border: 2px solid #ddd;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s ease;
        margin-top: 0.75rem;
    }

    .clear-btn:hover {
        border-color: var(--frc-190-red);
        background: rgba(200, 27, 0, 0.05);
    }

    .push-status { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1.2rem; padding: 0.9rem 1.1rem; border-radius: 8px; }
    .push-status.server { background: #d4edda; border: 2px solid #c3e6cb; }
    .push-status.local  { background: #fff3cd; border: 2px solid #ffeeba; }
    .push-status.partial { background: #fff3cd; border: 2px solid #ffc107; }
    .push-status.error  { background: #f8d7da; border: 2px solid #f5c6cb; }
    .push-label { font-size: 0.6rem; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: #555; }
    .push-message { font-size: 0.82rem; font-weight: 600; line-height: 1.5; color: #333; }

    /* Loading Spinner */
    .spinner {
        display: inline-block;
        width: 18px;
        height: 18px;
        border: 3px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top-color: white;
        animation: spin 0.8s linear infinite;
        margin-right: 0.75rem;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    /* Tablet */
    @media (max-width: 1024px) {
        .header h1 { font-size: 1.2rem; }
        .form-container { padding: 1.25rem; max-width: 100%; }
        .form-section { padding: 1.25rem; margin-bottom: 1.25rem; }
        .section-title { font-size: 0.95rem; margin-bottom: 0.9rem; }
        .form-group { margin-bottom: 1.25rem; }
        .submit-btn { font-size: 0.95rem; padding: 1rem; }
    }

    /* Mobile */
    @media (max-width: 768px) {
        .header { padding: 1.2rem; }
        .header h1 { font-size: 1.1rem; }
        .header .subtitle { font-size: 0.8rem; }
        .form-container { padding: 1rem; }
        .form-section { padding: 1.2rem; margin-bottom: 1.2rem; }
        .section-title { font-size: 0.9rem; margin-bottom: 0.8rem; }
        label, .field-label { font-size: 0.85rem; margin-bottom: 0.5rem; }
        input[type="text"], select { padding: 0.8rem 0.9rem; font-size: 0.95rem; }
        .bool-btn { padding: 0.8rem; font-size: 0.9rem; }
        .upload-icon { font-size: 1.5rem; }
        .upload-text { font-size: 0.8rem; }
        .submit-section { padding: 1.2rem; }
        .submit-btn { padding: 1rem; font-size: 0.9rem; }
        .clear-btn { padding: 0.8rem; font-size: 0.85rem; }
    }

    /* Small Mobile */
    @media (max-width: 480px) {
        .header { padding: 1rem; }
        .header h1 { font-size: 1rem; }
        .header .subtitle { font-size: 0.75rem; }
        .form-container { padding: 0.75rem; }
        .form-section { padding: 1rem; margin-bottom: 1rem; }
        .section-title { font-size: 0.85rem; margin-bottom: 0.75rem; padding-bottom: 0.5rem; }
        label, .field-label { font-size: 0.8rem; margin-bottom: 0.4rem; }
        .label-helper { font-size: 0.7rem; }
        input[type="text"], select { padding: 0.7rem 0.8rem; font-size: 0.9rem; }
        .bool-toggle { gap: 0.5rem; }
        .bool-btn { padding: 0.7rem; font-size: 0.85rem; }
        .upload-icon { font-size: 1.3rem; }
        .upload-text { font-size: 0.75rem; }
        .push-status { padding: 0.75rem; }
        .push-message { font-size: 0.75rem; }
        .submit-section { padding: 1rem; }
        .submit-btn { padding: 0.9rem; font-size: 0.85rem; letter-spacing: 0; }
        .clear-btn { padding: 0.75rem; font-size: 0.8rem; margin-top: 0.5rem; }
        .spinner { width: 16px; height: 16px; border-width: 2px; margin-right: 0.5rem; }
    }
</style>
