<script>
	import { onMount } from "svelte";
	import { fetchCOPRs, fetchMatchAlliances } from "../utils/api.js";
	import { getIndexedDBStore } from "../utils/indexedDB";
	import { estimateTeamPoints, estimateTeamPoints2 } from "../utils/pageUtils.js";

	let exampleLoading = true;
	let exampleError = "";
	let exampleEventCode = "";
	let exampleTeam = "";
	let exampleMatch = null;
	let exampleEfs1 = null;
	let exampleEfs2 = null;

	function toNumber(value) {
		const n = Number(value);
		return Number.isFinite(n) ? n : 0;
	}

	function fmt(value) {
		return toNumber(value).toFixed(2);
	}

	function normalizeTeam(raw) {
		return String(raw ?? "").replace(/\D/g, "");
	}

	function normalizeMatch(raw) {
		const parsed = parseInt(String(raw ?? "").replace(/\D/g, ""), 10);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	function unwrapRows(rawRows) {
		return (rawRows || []).map((item) =>
			item && item.value !== undefined ? item.value : item,
		);
	}

	function getExampleCandidate(rows, alliances) {
		const candidates = rows
			.filter((row) => row && row.RecordType !== "Match_Event")
			.filter((row) => normalizeTeam(row.Team || row.team) && normalizeMatch(row.Match) > 0);

		for (const row of candidates) {
			const teamNum = normalizeTeam(row.Team || row.team);
			const matchNum = normalizeMatch(row.Match);
			if (!teamNum || !matchNum) continue;

			const match = alliances.find(
				(m) => m.comp_level === "qm" && Number(m.match_number) === matchNum,
			);
			if (!match) continue;

			const redKeys = (match.alliances?.red?.team_keys || []).map((k) =>
				String(k).replace("frc", ""),
			);
			const blueKeys = (match.alliances?.blue?.team_keys || []).map((k) =>
				String(k).replace("frc", ""),
			);
			const onRed = redKeys.includes(teamNum);
			const onBlue = blueKeys.includes(teamNum);
			if (!onRed && !onBlue) continue;

			return {
				teamNum,
				matchNum,
			};
		}

		return null;
	}

	onMount(async () => {
		exampleLoading = true;
		exampleError = "";

		try {
			const eventCode = localStorage.getItem("eventCode") || "";
			exampleEventCode = eventCode;
			if (!eventCode) {
				exampleError = "No eventCode found in local storage.";
				exampleLoading = false;
				return;
			}

			const [rows, alliances, coprs] = await Promise.all([
				getIndexedDBStore("scoutingData"),
				fetchMatchAlliances(eventCode),
				fetchCOPRs(eventCode),
			]);

			const normalizedRows = unwrapRows(rows || []);
			const result = getExampleCandidate(normalizedRows, alliances || []);
			if (!result) {
				exampleError =
					"Could not build an example from current local data. Check that scouting rows include match/team values and completed match alliances include hub score breakdown.";
				exampleLoading = false;
				return;
			}

			const coprSource = coprs?.coprs ? coprs.coprs : coprs;
			const efs1 = estimateTeamPoints(
				result.teamNum,
				result.matchNum,
				alliances || [],
				normalizedRows,
			);
			const efs2 = estimateTeamPoints2(
				result.teamNum,
				result.matchNum,
				coprSource || {},
				normalizedRows,
				normalizedRows,
				alliances || [],
			);

			exampleTeam = result.teamNum;
			exampleMatch = result.matchNum;
			exampleEfs1 = efs1;
			exampleEfs2 = efs2;
		} catch (err) {
			exampleError = err?.message || "Failed to load local data example.";
		} finally {
			exampleLoading = false;
		}
	});
</script>

<div class="info-page">
	<div class="header-section">
		<h1>Info Page</h1>
		<p class="subtitle">FRC Team 190 - Quick Reference</p>
	</div>

	<section class="info-part">
		<h2>EFS1: Estimated Fuel Score (Time Share Model)</h2>
		<p>
			EFS1 estimates how many hub points one robot contributed in a specific
			qualification match by splitting the alliance hub score using each robot's
			share of FuelShootingTime.
		</p>
		<ul>
			<li>Only qualification matches are used (comp_level = qm).</li>
			<li>
				The code finds your alliance and reads only that alliance's hubScore
				breakdown.
			</li>
			<li>
				It sums FuelShootingTime for your robot in that match, then for all 3
				alliance robots.
			</li>
			<li>
				It computes team share = team shooting time / alliance shooting time.
			</li>
			<li>
				For each phase (Auto, Transition, Shift1-Shift4, Endgame), EFS1 adds:
				team share x actual hub points in that phase.
			</li>
			<li>Final value is rounded to 1 decimal place.</li>
		</ul>
		<div class="formula-block">
			<p class="formula-title">EFS1 formula</p>
			<p>
				EFS1 = sum over phases [ (team FuelShootingTime / alliance FuelShootingTime)
				x phaseHubPoints ]
			</p>
		</div>
	</section>

	<section class="info-part">
		<h2>EFS2: More Accurate EFS (Phase Rate Model)</h2>
		<p>
			EFS2 is calculated independently per phase/shift. It uses
			FuelShootingPhases and COPR phase counts to estimate each robot's relative
			production rate in each scoring window, then allocates that phase's points.
		</p>
		<ul>
			<li>Only qualification matches are used (comp_level = qm).</li>
			<li>
				Per phase, it uses COPR metrics:
				Hub Auto/Transition/Shift1/Shift2/Shift3/Shift4/Endgame Fuel Count.
			</li>
			<li>
				Per team phase rate is computed as fuel per second for that shift:
				phase COPR / shift shooting time (from FuelShootingPhases).
			</li>
			<li>
				Alliance phase rate = sum of the 3 alliance team rates for that phase.
			</li>
			<li>
				Team phase share = team phase rate / alliance phase rate.
			</li>
			<li>
				For each phase, EFS2 adds:
				team phase share x actual hub points in that phase.
			</li>
			<li>Final value is rounded to 1 decimal place.</li>
		</ul>
		<div class="formula-block">
			<p class="formula-title">EFS2 formula</p>
			<p>
				fuelPerSecondShift(team) = COPRshift(team) / shootingTimeShift(team)
			</p>
			<p>
				EFS2 = sum over shifts [ shiftHubPoints x (fuelPerSecondShift(team) /
				sum fuelPerSecondShift(alliance teams)) ]
			</p>
		</div>
		<p class="note">
			Practical interpretation: EFS1 is a good fast estimate based on total
			shooting time. EFS2 is usually better when alliance roles change by phase,
			because it attributes points shift-by-shift with separate per-phase rates.
		</p>

		<div class="example-block">
			<h3>Live Local Example (Using pageUtils)</h3>
			{#if exampleLoading}
				<p>Loading local example...</p>
			{:else if exampleError}
				<p class="example-error">{exampleError}</p>
			{:else}
				<p class="example-meta">
					Event: {exampleEventCode} | Team: frc{exampleTeam} | Match: Q{exampleMatch}
				</p>
				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Metric</th>
								<th>Value</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>EFS1</td>
								<td>{fmt(exampleEfs1)}</td>
							</tr>
							<tr>
								<td>EFS2</td>
								<td>{fmt(exampleEfs2)}</td>
							</tr>
						</tbody>
					</table>
				</div>
				<p class="example-meta" style="margin-top: 0.65rem;">
					Both values above are computed by pageUtils: estimateTeamPoints and estimateTeamPoints2.
				</p>
			{/if}
		</div>
	</section>
</div>

<style>
	:root {
		--frc-190-red: #c81b00;
		--wpi-gray: #a9b0b7;
		--frc-190-black: #4d4d4d;
	}

	.info-page {
		min-height: 100vh;
		width: 100%;
		padding: 1.25rem;
		background: var(--wpi-gray);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.header-section {
		text-align: center;
		margin-bottom: 0.25rem;
	}

	.header-section h1 {
		color: var(--frc-190-red);
		font-size: 1.8rem;
		font-weight: 800;
		margin: 0 0 0.3rem;
		letter-spacing: 0.8px;
		text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.25);
	}

	.subtitle {
		color: var(--frc-190-black);
		font-size: 0.9rem;
		margin: 0;
	}

	.info-part {
		width: 100%;
		max-width: 62.5rem;
		background: linear-gradient(135deg, #1f1f1f 0%, #2f2f2f 100%);
		border: 2px solid var(--frc-190-red);
		border-radius: 0.625rem;
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.25);
		color: #fff;
		padding: 1rem 1.2rem;
	}

	.info-part h2 {
		margin: 0 0 0.5rem;
		font-size: 1.2rem;
		color: #fff;
	}

	.info-part p {
		margin: 0;
		line-height: 1.6;
		color: #e7e7e7;
	}

	.info-part ul {
		margin: 0.6rem 0 0.75rem;
		padding-left: 1.2rem;
	}

	.info-part li {
		margin-bottom: 0.35rem;
		line-height: 1.5;
		color: #efefef;
	}

	.formula-block {
		margin-top: 0.6rem;
		padding: 0.7rem 0.8rem;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 0.45rem;
	}

	.formula-title {
		font-weight: 700;
		color: #fff;
		margin-bottom: 0.3rem;
	}

	.note {
		margin-top: 0.75rem;
		font-size: 0.95rem;
		color: #f3e6d5;
	}

	.example-block {
		margin-top: 1rem;
		padding-top: 0.9rem;
		border-top: 1px solid rgba(255, 255, 255, 0.25);
	}

	.example-block h3 {
		margin: 0 0 0.45rem;
		font-size: 1.05rem;
		color: #fff;
	}

	.example-meta {
		margin-bottom: 0.65rem;
		font-size: 0.92rem;
		color: #ffd8c9;
	}

	.example-error {
		color: #ffb4b4;
	}

	.table-wrap {
		overflow-x: auto;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 0.45rem;
	}

	.table-wrap table {
		width: 100%;
		border-collapse: collapse;
		min-width: 38rem;
	}

	.table-wrap th,
	.table-wrap td {
		padding: 0.5rem 0.6rem;
		text-align: left;
		font-size: 0.88rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.12);
	}

	.table-wrap th {
		background: rgba(255, 255, 255, 0.12);
		font-weight: 700;
		color: #fff;
	}

	@media (max-width: 768px) {
		.info-page {
			padding: 0.9rem;
		}

		.header-section h1 {
			font-size: 1.4rem;
		}

		.subtitle {
			font-size: 0.82rem;
		}

		.info-part {
			padding: 0.85rem 0.95rem;
		}

		.info-part h2 {
			font-size: 1.05rem;
		}
	}
</style>
