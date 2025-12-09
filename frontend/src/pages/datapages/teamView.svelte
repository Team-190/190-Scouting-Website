<script lang="ts">
    import { onMount } from "svelte";
    import {
        createGrid,
        ModuleRegistry,
        AllCommunityModule
    } from "ag-grid-community";

    import "ag-grid-community/styles/ag-grid.css";
    import "ag-grid-community/styles/ag-theme-quartz.css";
    import { fetchTeamView } from "../../utils/api"
    import Team from "../../components/Team.svelte";

    ModuleRegistry.registerModules([AllCommunityModule]);
    const TBA_KEY = "zhTqFG7csJoif1sNXt3aZngy0LB1X4LxMgTfXBvPscNG0P9FifZCa2uGJcUk2gKW";

    let domNode;

    /* -------- Stats helpers -------- */
    const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const sd = (arr, mu) => {
        const variance = arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length;
        return Math.sqrt(variance);
    };

    const RED = [255, 0, 0];
    const YELLOW = [255, 255, 0];
    const GREEN = [0, 255, 0];

    const lerpColor = (c1, c2, t) =>
        `rgb(${[
            Math.round(c1[0] + (c2[0] - c1[0]) * t),
            Math.round(c1[1] + (c2[1] - c1[1]) * t),
            Math.round(c1[2] + (c2[2] - c1[2]) * t)
        ].join(",")})`;

    function colorFromStats(v, mu, sigma) {
        if (v === 0) return "black";
        if (sigma === 0) return "yellow";
        const z = (v - mu) / sigma;
        return lerpColor(
            z < 0 ? YELLOW : YELLOW,
            z < 0 ? RED : GREEN,
            Math.min(1, Math.abs(z))
        );
    }

    function TeamHeaderComponent() {}

    TeamHeaderComponent.prototype.init = function (params) {
        this.params = params;

        const div = document.createElement("div");
        div.style.display = "flex";
        div.style.alignItems = "center";
        div.style.justifyContent = "center";
        div.style.height = "100%";

        const select = document.createElement("select");
        select.style.width = "140px";
        select.style.padding = "4px";
        select.style.fontWeight = "bold";
        select.style.background = "#7a1f1f";
        select.style.color = "white";
        select.style.border = "none";
        select.style.borderRadius = "4px";

        // Populate list of teams
        params.context.allTeams.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t;
            opt.textContent = t;
            select.appendChild(opt);
        });

        select.value = params.context.selectedTeam;

        // When selection changes → load data & refresh grid
        select.addEventListener("change", async (e) => {
            const target = e.target as HTMLSelectElement;
            const t = Number(target.value);
            params.context.selectedTeam = t;

            await params.context.loadTeamData(t);

            params.api.refreshHeader();
        });

        div.appendChild(select);
        this.eGui = div;
    };

    TeamHeaderComponent.prototype.getGui = function () {
        return this.eGui;
    };

    let allTeams = [];
    let selectedTeam = null;

    // load list of teams attending season (simplified)
    async function loadAllTeams() {
        // replace with your real source later
        allTeams = [190, 254, 1678, 6328, 2056, 148, 118];
        if (!selectedTeam) selectedTeam = allTeams[0];
    }

    async function loadTeamData(teamNumber) {
        const json = await fetchTeamView(teamNumber);
        const teamData = await json.json()
        buildGrid(teamData);
    }

    let gridInstance = null;

    async function buildGrid(teamData) {
        const matches = teamData.data;
        console.log(matches);
        const matchNums = matches.map(m => m.Match);
        const qLabels = matchNums.map((_, i) => `Q${i + 1}`);

        const sample = matches[0];
        const numericMetrics = Object.keys(sample).filter(
            k => k !== "Match" && !isNaN(Number(sample[k]))
        );

        const rowData = [];

        // First row: Match Numbers
        const matchRow = { metric: "MatchNum" };
        qLabels.forEach((q, i) => {
            matchRow[q] = matchNums[i];
        });
        rowData.push(matchRow);

        // Other metrics
        numericMetrics.forEach(metric => {
            const row = { metric };
            qLabels.forEach((q, i) => {
                const match = matches[i];
                row[q] = Number(match?.[metric] || 0);
            });
            rowData.push(row);
        });

        const columnDefs = [
            {
                headerComponent: "teamHeader",
                field: "metric",
                pinned: "left",
                width: 160,
                cellStyle: {
                    background: "#7a1f1f",
                    color: "white",
                    fontWeight: "bold"
                }
            },
            ...qLabels.map((q, colIndex) => ({
                headerName: q,
                field: q,
                width: 110,
                cellStyle: params => {
                    if (params.data.metric === "MatchNum") {
                        return {
                            background: "#333",
                            color: "white",
                            fontWeight: 800,
                            textAlign: "center"
                        };
                    }

                    const values = qLabels.map(q => params.data[q]);
                    const mu = mean(values);
                    const sigma = sd(values, mu);
                    return {
                        background: colorFromStats(params.value, mu, sigma),
                        color: params.value === 0 ? "white" : "black",
                        fontWeight: 600,
                        textAlign: "center"
                    };
                }
            }))
        ];

        if (gridInstance) {
            gridInstance.api.setRowData(rowData);
            gridInstance.api.setColumnDefs(columnDefs);
            return;
        }

        gridInstance = createGrid(domNode, {
            rowData,
            columnDefs,
            components: { teamHeader: TeamHeaderComponent },
            context: {
                selectedTeam,
                allTeams,
                loadTeamData
            },
            defaultColDef: {
                resizable: true,
                sortable: false
            }
        });
    }

    onMount(async () => {
        await loadAllTeams();
        await loadTeamData(selectedTeam);
    });
</script>

<div class="ag-theme-quartz" style="height: 100vh; width: 100vw;" bind:this={domNode}></div>