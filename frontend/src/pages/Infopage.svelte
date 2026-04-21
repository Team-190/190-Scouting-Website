<script>
	import { onMount } from "svelte";
	import "katex/dist/katex.min.css";
	import renderMathInElement from "katex/contrib/auto-render";
	let infoPageEl;
	const equationEfs1 = "$$\\mathrm{EFS}_1 = \\sum_{p \\in \\mathcal{P}} \\left(\\frac{T_{\\text{team}}}{T_{\\text{alliance}}}\\right) H_p$$";
	const equationEfs2Rate = "$$r_{i,s} = \\frac{\\mathrm{COPR}_{i,s}}{t_{i,s}}$$";
	const equationEfs2 = "$$\\mathrm{EFS}_2 = \\sum_{s \\in \\mathcal{S}} H_s \\left(\\frac{r_{\\text{team},s}}{\\sum_{i \\in A} r_{i,s}}\\right)$$";

	function renderLatexEquations() {
		if (!infoPageEl) return;
		renderMathInElement(infoPageEl, {
			throwOnError: false,
			delimiters: [
				{ left: "$$", right: "$$", display: true },
				{ left: "$", right: "$", display: false },
			],
		});
	}

	onMount(() => {
		renderLatexEquations();
	});
</script>

<div class="info-page" bind:this={infoPageEl}>
	<div class="fx-layer" aria-hidden="true">
		<span class="orbit orbit-a"></span>
		<span class="orbit orbit-b"></span>
		<span class="gem gem-a"></span>
		<span class="gem gem-b"></span>
		<span class="beam beam-a"></span>
		<span class="beam beam-b"></span>
	</div>

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
			<p class="latex-equation">
				{equationEfs1}
			</p>
		</div>

		<div class="example-row-block">
			<p class="example-row-title">Example Row (Fill In Later)</p>
			<div class="phase-grid">
				<div class="phase-box"><span class="phase-label">Auto</span><span class="phase-value"></span></div>
				<div class="phase-box"><span class="phase-label">Transition</span><span class="phase-value"></span></div>
				<div class="phase-box"><span class="phase-label">Shift 1</span><span class="phase-value"></span></div>
				<div class="phase-box"><span class="phase-label">Shift 2</span><span class="phase-value"></span></div>
				<div class="phase-box"><span class="phase-label">Shift 3</span><span class="phase-value"></span></div>
				<div class="phase-box"><span class="phase-label">Shift 4</span><span class="phase-value"></span></div>
				<div class="phase-box"><span class="phase-label">Endgame</span><span class="phase-value"></span></div>
				<div class="phase-box total-box"><span class="phase-label">Total</span><span class="phase-value"></span></div>
			</div>
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
			<p class="latex-equation">
				{equationEfs2Rate}
			</p>
			<p class="latex-equation">
				{equationEfs2}
			</p>
		</div>
		<p class="note">
			Practical interpretation: EFS1 is a good fast estimate based on total
			shooting time. EFS2 is usually better when alliance roles change by phase,
			because it attributes points shift-by-shift with separate per-phase rates.
		</p>

		<div class="example-row-block">
			<p class="example-row-title">Example Row (Fill In Later)</p>
			<div class="phase-grid">
				<div class="phase-box"><span class="phase-label">Auto</span><span class="phase-value"></span></div>
				<div class="phase-box"><span class="phase-label">Transition</span><span class="phase-value"></span></div>
				<div class="phase-box"><span class="phase-label">Shift 1</span><span class="phase-value"></span></div>
				<div class="phase-box"><span class="phase-label">Shift 2</span><span class="phase-value"></span></div>
				<div class="phase-box"><span class="phase-label">Shift 3</span><span class="phase-value"></span></div>
				<div class="phase-box"><span class="phase-label">Shift 4</span><span class="phase-value"></span></div>
				<div class="phase-box"><span class="phase-label">Endgame</span><span class="phase-value"></span></div>
				<div class="phase-box total-box"><span class="phase-label">Total</span><span class="phase-value"></span></div>
			</div>
		</div>
	</section>
</div>

<style>
	:root {
		--frc-190-red: #c81b00;
		--wpi-gray: #a9b0b7;
		--frc-190-black: #4d4d4d;
		--gold-glow: #ffd56a;
		--sky-glow: #8eeaff;
		--rose-glow: #ff8bc9;
	}

	.info-page {
		position: relative;
		overflow: hidden;
		isolation: isolate;
		min-height: 100vh;
		width: 100%;
		padding: 1.25rem;
		background:
			radial-gradient(circle at 16% 22%, rgba(255, 147, 88, 0.42), transparent 34%),
			radial-gradient(circle at 84% 10%, rgba(113, 237, 255, 0.35), transparent 38%),
			radial-gradient(circle at 20% 90%, rgba(255, 228, 133, 0.25), transparent 34%),
			linear-gradient(145deg, #6f7883 0%, #8f97a3 45%, #6b7480 100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.fx-layer {
		position: absolute;
		inset: 0;
		z-index: 1;
		pointer-events: none;
		overflow: hidden;
	}

	.orbit {
		position: absolute;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.25);
		box-shadow:
			0 0 24px rgba(255, 213, 106, 0.2),
			0 0 40px rgba(142, 234, 255, 0.14) inset;
		mix-blend-mode: screen;
		opacity: 0.65;
	}

	.orbit-a {
		width: min(82vw, 50rem);
		height: min(82vw, 50rem);
		top: -20rem;
		left: -14rem;
		border-top-color: rgba(255, 213, 106, 0.95);
		border-right-color: rgba(142, 234, 255, 0.75);
		border-bottom-color: rgba(255, 139, 201, 0.2);
		border-left-color: rgba(255, 255, 255, 0.12);
		animation: orbitSpin 20s linear infinite;
	}

	.orbit-b {
		width: min(72vw, 42rem);
		height: min(72vw, 42rem);
		right: -13rem;
		bottom: -15rem;
		border-top-color: rgba(255, 255, 255, 0.15);
		border-right-color: rgba(255, 139, 201, 0.88);
		border-bottom-color: rgba(255, 213, 106, 0.76);
		border-left-color: rgba(142, 234, 255, 0.8);
		animation: orbitSpinReverse 24s linear infinite;
	}

	.gem {
		position: absolute;
		width: 1rem;
		height: 1rem;
		transform: rotate(45deg);
		background: linear-gradient(140deg, rgba(255, 255, 255, 0.95), rgba(255, 213, 106, 0.55));
		box-shadow:
			0 0 12px rgba(255, 255, 255, 0.6),
			0 0 24px rgba(255, 213, 106, 0.35);
		opacity: 0.75;
	}

	.gem::before,
	.gem::after {
		content: "";
		position: absolute;
		inset: -0.4rem;
		border: 1px solid rgba(255, 255, 255, 0.34);
		transform: rotate(0deg);
	}

	.gem::after {
		inset: -0.75rem;
		opacity: 0.5;
	}

	.gem-a {
		top: 16%;
		right: 12%;
		animation: gemSpinFloat 8s ease-in-out infinite;
	}

	.gem-b {
		left: 10%;
		bottom: 22%;
		animation: gemSpinFloat 9.8s ease-in-out infinite reverse;
	}

	.beam {
		position: absolute;
		width: 140%;
		height: 2.2rem;
		left: -20%;
		background: linear-gradient(
			90deg,
			transparent 0%,
			rgba(255, 255, 255, 0.05) 25%,
			rgba(255, 213, 106, 0.24) 48%,
			rgba(142, 234, 255, 0.2) 66%,
			transparent 100%
		);
		filter: blur(0.6px);
		opacity: 0.52;
		mix-blend-mode: screen;
	}

	.beam-a {
		top: 18%;
		transform: rotate(-15deg);
		animation: beamSweep 9s linear infinite;
	}

	.beam-b {
		top: 70%;
		transform: rotate(11deg);
		animation: beamSweep 10.2s linear infinite reverse;
	}

	.info-page::before,
	.info-page::after {
		content: "";
		position: absolute;
		inset: -8%;
		z-index: 0;
		pointer-events: none;
	}

	.info-page::before {
		background:
			radial-gradient(circle, rgba(255, 255, 255, 0.88) 0 1px, transparent 2px) 2% 12% / 22% 24%,
			radial-gradient(circle, rgba(255, 248, 207, 0.82) 0 1px, transparent 2px) 14% 32% / 25% 24%,
			radial-gradient(circle, rgba(164, 240, 255, 0.78) 0 1px, transparent 2px) 60% 22% / 21% 22%,
			radial-gradient(circle, rgba(255, 179, 219, 0.75) 0 1px, transparent 2px) 84% 62% / 24% 25%,
			radial-gradient(circle, rgba(255, 255, 255, 0.74) 0 1px, transparent 2px) 58% 84% / 21% 24%;
		opacity: 0.65;
		animation: sparkleDrift 16s linear infinite, sparkleTwinkle 3.2s ease-in-out infinite;
	}

	.info-page::after {
		background:
			conic-gradient(from 0deg at 30% 0%, rgba(255, 213, 106, 0.3), transparent 30%),
			conic-gradient(from 120deg at 70% 100%, rgba(142, 234, 255, 0.27), transparent 34%),
			conic-gradient(from 230deg at 50% 45%, rgba(255, 139, 201, 0.22), transparent 44%);
		filter: blur(26px) saturate(120%);
		opacity: 0.65;
		animation: auroraSpin 24s linear infinite;
	}

	.header-section {
		position: relative;
		z-index: 2;
		text-align: center;
		margin-bottom: 0.25rem;
		padding: 1rem 1.4rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.23);
		backdrop-filter: blur(8px);
		box-shadow:
			0 6px 22px rgba(32, 26, 13, 0.24),
			0 0 0 1px rgba(255, 255, 255, 0.4) inset;
		animation: titleFloat 3.8s ease-in-out infinite;
	}

	.header-section h1 {
		color: var(--frc-190-red);
		font-size: 1.8rem;
		font-weight: 800;
		margin: 0 0 0.3rem;
		letter-spacing: 0.8px;
		text-shadow:
			0 2px 2px rgba(0, 0, 0, 0.4),
			0 0 16px rgba(255, 213, 106, 0.35);
	}

	.subtitle {
		color: var(--frc-190-black);
		font-size: 0.9rem;
		margin: 0;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 1.2px;
	}

	.info-part {
		position: relative;
		z-index: 2;
		width: 100%;
		max-width: 62.5rem;
		background: linear-gradient(135deg, #1f1f1f 0%, #2f2f2f 100%);
		border: 2px solid rgba(200, 27, 0, 0.95);
		border-radius: 0.625rem;
		box-shadow:
			0 7px 22px rgba(0, 0, 0, 0.36),
			0 0 0 1px rgba(255, 255, 255, 0.06) inset;
		color: #fff;
		padding: 1rem 1.2rem;
		transform-style: preserve-3d;
		transition:
			transform 280ms ease,
			box-shadow 280ms ease,
			border-color 280ms ease;
	}

	.info-part::before {
		content: "";
		position: absolute;
		inset: -2px;
		border-radius: 0.7rem;
		background: conic-gradient(
			from 0deg,
			rgba(255, 213, 106, 0.9),
			rgba(142, 234, 255, 0.88),
			rgba(255, 139, 201, 0.82),
			rgba(255, 213, 106, 0.9)
		);
		filter: blur(10px);
		opacity: 0.25;
		z-index: -1;
		animation: haloSpin 12s linear infinite;
	}

	.info-part::after {
		content: "";
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: linear-gradient(
			115deg,
			rgba(255, 255, 255, 0.12) 0%,
			transparent 36%,
			rgba(255, 255, 255, 0.06) 62%,
			transparent 100%
		);
		mix-blend-mode: screen;
		opacity: 0.4;
		pointer-events: none;
	}

	.info-part:hover {
		transform: perspective(900px) rotateX(2.7deg) rotateY(-2.7deg) translateY(-2px);
		border-color: var(--gold-glow);
		box-shadow:
			0 12px 30px rgba(0, 0, 0, 0.42),
			0 0 20px rgba(255, 213, 106, 0.18),
			0 0 0 1px rgba(255, 255, 255, 0.09) inset;
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
		background: linear-gradient(120deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.06));
		border: 1px solid rgba(255, 255, 255, 0.22);
		border-radius: 0.45rem;
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06) inset;
		animation: gentlePulse 4.6s ease-in-out infinite;
	}

	.formula-title {
		font-weight: 700;
		color: #fff;
		margin-bottom: 0.3rem;
	}

	.latex-equation {
		font-family: "Times New Roman", Times, serif;
		font-size: 1rem;
		line-height: 1.5;
		letter-spacing: 0.01em;
		word-break: break-word;
		color: #f8f8f8;
	}

	.note {
		margin-top: 0.75rem;
		font-size: 0.95rem;
		color: #f3e6d5;
	}

	.example-row-block {
		margin-top: 0.9rem;
		padding: 0.7rem 0.8rem;
		border: 1px solid rgba(255, 255, 255, 0.24);
		border-radius: 0.45rem;
		background: rgba(0, 0, 0, 0.2);
	}

	.example-row-title {
		margin: 0 0 0.55rem !important;
		font-size: 0.88rem;
		font-weight: 700;
		color: #ffe0b8 !important;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.phase-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.phase-box {
		border: 1px solid rgba(255, 255, 255, 0.26);
		border-radius: 0.4rem;
		background: rgba(255, 255, 255, 0.06);
		padding: 0.45rem 0.55rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-height: 3.2rem;
	}

	.phase-label {
		font-size: 0.78rem;
		font-weight: 700;
		color: #f8f8f8;
		line-height: 1.2;
	}

	.phase-value {
		display: block;
		min-height: 1.15rem;
		border-bottom: 1px dashed rgba(255, 255, 255, 0.35);
	}

	.total-box {
		border-color: rgba(255, 213, 106, 0.75);
		background: rgba(255, 213, 106, 0.12);
	}

	@keyframes sparkleDrift {
		0% {
			transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
			opacity: 0.45;
		}
		25% {
			transform: translate3d(-1%, 1.8%, 0) rotate(18deg) scale(1.02);
			opacity: 0.75;
		}
		50% {
			transform: translate3d(1.5%, -1.2%, 0) rotate(180deg) scale(1);
			opacity: 0.55;
		}
		75% {
			transform: translate3d(-1.3%, -1%, 0) rotate(252deg) scale(0.97);
			opacity: 0.72;
		}
		100% {
			transform: translate3d(0, 0, 0) rotate(360deg) scale(1);
			opacity: 0.45;
		}
	}

	@keyframes sparkleTwinkle {
		0%,
		100% {
			filter: brightness(0.92) saturate(100%);
		}
		33% {
			filter: brightness(1.14) saturate(118%);
		}
		66% {
			filter: brightness(1.02) saturate(130%);
		}
	}

	@keyframes orbitSpin {
		from {
			transform: rotate(0deg) scale(1);
		}
		to {
			transform: rotate(360deg) scale(1.04);
		}
	}

	@keyframes orbitSpinReverse {
		from {
			transform: rotate(360deg) scale(1.02);
		}
		to {
			transform: rotate(0deg) scale(1);
		}
	}

	@keyframes gemSpinFloat {
		0%,
		100% {
			transform: translate3d(0, 0, 0) rotate(45deg) scale(1);
			opacity: 0.72;
		}
		50% {
			transform: translate3d(0, -0.75rem, 0) rotate(405deg) scale(1.22);
			opacity: 0.98;
		}
	}

	@keyframes beamSweep {
		0% {
			transform: translateX(-12%) rotate(-15deg);
			opacity: 0;
		}
		15% {
			opacity: 0.46;
		}
		55% {
			opacity: 0.54;
		}
		100% {
			transform: translateX(14%) rotate(-15deg);
			opacity: 0;
		}
	}

	@keyframes auroraSpin {
		from {
			transform: rotate(0deg) scale(1.02);
		}
		to {
			transform: rotate(360deg) scale(1.02);
		}
	}

	@keyframes haloSpin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes titleFloat {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-4px);
		}
	}

	@keyframes gentlePulse {
		0%,
		100% {
			box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06) inset, 0 0 0 rgba(255, 213, 106, 0);
		}
		50% {
			box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1) inset, 0 0 18px rgba(255, 213, 106, 0.16);
		}
	}

	@media (max-width: 768px) {
		.info-page {
			padding: 0.9rem;
		}

		.orbit-a {
			width: 28rem;
			height: 28rem;
			top: -12rem;
			left: -11rem;
		}

		.orbit-b {
			width: 24rem;
			height: 24rem;
			right: -10rem;
			bottom: -10rem;
		}

		.beam {
			height: 1.4rem;
			opacity: 0.35;
		}

		.gem {
			opacity: 0.58;
		}

		.header-section {
			padding: 0.75rem 0.9rem;
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

		.info-part:hover {
			transform: none;
		}

		.phase-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.orbit,
		.gem,
		.beam,
		.info-page::before,
		.info-page::after,
		.info-part::before,
		.header-section,
		.formula-block {
			animation: none;
		}

		.info-part,
		.info-part:hover {
			transition: none;
			transform: none;
		}
	}
</style>
