<script lang="ts">
/**
 * 复刻自 leehenry.top/archive/ 的 Heatmap.svelte
 * 布局：每年一行 × 53 周，每格 = 一周的更新字数，格子宽度自适应铺满容器
 * 交互：右侧 Less/More 色阶图例；年份多于 3 个时左上角出现 ↺ 按钮往前翻页
 */
import Icon from "@iconify/svelte";
import { onDestroy } from "svelte";

export let entries: { date: string; words: number }[] = [];
export let cell = 10;
export let gap = 2;

const WEEKS = 53;
const YEARS_SHOWN = 3;
const WEEK_MARKS = new Set([1, 14, 27, 40, 53]);

// 色阶阈值（按"周字数"分档）。原站是 3000/6000/9000，按本站体量下调
const LEVEL_THRESHOLDS = [1000, 2000, 3000];

/** 日期字符串 → 该日期在当年的第几周（1~53，1 月 1 日为第 1 周起点） */
function weekOf(dateStr: string) {
	const d = new Date(`${dateStr}T00:00:00Z`);
	const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
	return Math.min(Math.floor((d.getTime() - jan1) / (7 * 86400000)) + 1, WEEKS);
}

// "年-周" → 字数
const weekWords = new Map<string, number>();
for (const e of entries) {
	const s = e.date.slice(0, 10);
	const key = `${s.slice(0, 4)}-${String(weekOf(s)).padStart(2, "0")}`;
	weekWords.set(key, (weekWords.get(key) ?? 0) + e.words);
}

const years = Array.from(new Set(entries.map((e) => Number(e.date.slice(0, 4))))).sort(
	(a, b) => a - b,
);

let cursor = years.length;
$: visibleYears = years.slice(Math.max(0, cursor - YEARS_SHOWN), cursor);

function shiftYears() {
	if (years.length <= YEARS_SHOWN) return;
	cursor = cursor <= YEARS_SHOWN ? years.length : cursor - 1;
}

function wordsOf(year: number, weekIdx: number) {
	return weekWords.get(`${year}-${String(weekIdx + 1).padStart(2, "0")}`) ?? 0;
}

function levelOf(words: number) {
	if (words <= 0) return 0;
	if (words < LEVEL_THRESHOLDS[0]) return 1;
	if (words < LEVEL_THRESHOLDS[1]) return 2;
	if (words < LEVEL_THRESHOLDS[2]) return 3;
	return 4;
}

// 今天是第几周（用本地日期，别用 toISOString——它会按 UTC 算，半夜会差一天）
const bootTime = new Date();
const nowYear = bootTime.getFullYear();
const nowWeek = weekOf(
	`${nowYear}-${String(bootTime.getMonth() + 1).padStart(2, "0")}-${String(bootTime.getDate()).padStart(2, "0")}`,
);

// ===== 悬浮提示：固定定位，挂在 body 上，避免被卡片 overflow 裁掉 =====
let tipEl: HTMLDivElement | null = null;

function ensureTip() {
	if (!tipEl) {
		tipEl = document.createElement("div");
		tipEl.className = "hm-tip";
		tipEl.style.visibility = "hidden";
		document.body.appendChild(tipEl);
	}
	return tipEl;
}

function showTip(e: MouseEvent, text: string) {
	const tip = ensureTip();
	const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
	tip.style.left = `${rect.left + rect.width / 2}px`;
	tip.style.top = `${rect.top}px`;
	tip.textContent = text;
	tip.style.visibility = "visible";
	tip.style.opacity = "1";
}

function hideTip() {
	if (!tipEl) return;
	tipEl.style.opacity = "0";
	tipEl.style.visibility = "hidden";
}

onDestroy(() => {
	tipEl?.remove();
	tipEl = null;
});
</script>

<div class="hm hidden md:block mb-4" style={`--cell: ${cell}px; --gap: ${gap}px;`}>
    <div class="card card-base">
        <div class="toolbar">
            <div class="flex items-center gap-1.5">
                <span class="legend-label">Words per week</span>
                {#if years.length > YEARS_SHOWN}
                    <button class="year-trigger" aria-label="切换年份" on:click={shiftYears}>
                        <Icon icon="material-symbols:history" class="year-trigger-icon" />
                    </button>
                {/if}
            </div>
            <div class="legend">
                <span>Less</span>
                {#each [0, 1, 2, 3, 4] as lv}
                    <div class={`chip lvl-${lv}`}></div>
                {/each}
                <span>More</span>
            </div>
        </div>

        <div class="scroller">
            <div class="matrix">
                {#each visibleYears as year}
                    <div class="row">
                        <span class="year-label">{year}</span>
                        <div class="weeks-row">
                            {#each Array(WEEKS) as _, wi}
                                <div
                                        class={`cell lvl-${levelOf(wordsOf(year, wi))}${year === nowYear && wi + 1 > nowWeek ? " future" : ""}`}
                                        role="img"
                                        aria-label={`${year} 第 ${wi + 1} 周，${wordsOf(year, wi)} 字`}
                                        on:mouseenter={(e) => showTip(e, `${year} W${wi + 1} · ${wordsOf(year, wi)} 字`)}
                                        on:mouseleave={hideTip}
                                ></div>
                            {/each}
                        </div>
                    </div>
                {/each}

                <div class="week-label-row">
                    <div class="week-label-spacer"></div>
                    <div class="week-labels">
                        {#each Array(WEEKS) as _, wi}
                            <span class={`wl${wi === 0 ? " wl-first" : ""}${wi === WEEKS - 1 ? " wl-last" : ""}`}>
                                {WEEK_MARKS.has(wi + 1) ? `W${wi + 1}` : ""}
                            </span>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    .hm {
        --muted: #6b7280;
    }

    :global(.dark) .hm {
        --muted: #9ca3af;
    }

    .card {
        padding: 24px 32px;
    }

    .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
        gap: 8px;
    }

    .legend {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        color: var(--muted);
    }

    .legend-label {
        margin-right: 2px;
        font-weight: 700;
        color: rgb(0 0 0 / 0.75);
    }

    :global(.dark) .legend-label {
        color: rgb(255 255 255 / 0.75);
    }

    .chip {
        width: var(--cell);
        height: var(--cell);
        border-radius: 0;
        flex-shrink: 0;
    }

    .year-trigger {
        display: inline-flex;
        align-items: center;
        cursor: pointer;
        background: none;
        border: none;
        padding: 0;
        line-height: 1;
        color: var(--muted);
    }

    .year-trigger :global(.year-trigger-icon) {
        opacity: 0.45;
        transition: opacity 0.2s;
        font-size: 1rem;
    }

    .year-trigger:hover :global(.year-trigger-icon) {
        opacity: 1;
    }

    .scroller {
        width: 100%;
    }

    .matrix {
        display: flex;
        flex-direction: column;
        gap: var(--gap);
    }

    .row {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
    }

    .year-label {
        font-size: 14px;
        color: var(--muted);
        width: 2.8rem;
        text-align: left;
        flex-shrink: 0;
        user-select: none;
        font-variant-numeric: tabular-nums;
    }

    /* 格子不设固定宽度：flex:1 把 53 周平摊铺满整行，永远不会出现右侧空白 */
    .weeks-row {
        display: flex;
        gap: 0;
        flex: 1;
        min-width: 0;
    }

    .cell {
        flex: 1;
        height: calc(var(--cell) * 1.5);
        border-radius: 0;
        min-width: 0;
    }

    .week-label-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-top: 2px;
        width: 100%;
    }

    .week-label-spacer {
        width: 2.8rem;
        flex-shrink: 0;
    }

    .week-labels {
        display: flex;
        gap: 0;
        flex: 1;
        min-width: 0;
    }

    .wl {
        flex: 1;
        font-size: 10.4px;
        line-height: 1;
        color: rgb(0 0 0 / 0.3);
        text-align: center;
        min-width: 0;
        white-space: nowrap;
        overflow: visible;
        user-select: none;
        font-variant-numeric: tabular-nums;
    }

    :global(.dark) .wl {
        color: rgb(255 255 255 / 0.3);
    }

    .wl-first {
        text-align: left;
    }

    .wl-last {
        transform: translate(-0.3rem);
    }

    .future {
        opacity: 0.2;
    }

    .lvl-0 {
        background: var(--btn-regular-bg);
    }

    .lvl-1 {
        background: var(--primary);
        opacity: 0.35;
    }

    .lvl-2 {
        background: var(--primary);
        opacity: 0.55;
    }

    .lvl-3 {
        background: var(--primary);
        opacity: 0.75;
    }

    .lvl-4 {
        background: var(--primary);
        opacity: 1;
    }

    /* 悬浮提示挂在 body 上（全局），避免被卡片裁掉 */
    :global(.hm-tip) {
        position: fixed;
        transform: translate(-50%, calc(-100% - 6px));
        padding: 0.3rem 0.6rem;
        background: var(--card-bg);
        color: rgb(0 0 0 / 0.75);
        border: 1px solid var(--line-divider);
        border-radius: 0.5rem;
        box-shadow: 0 10px 30px rgb(0 0 0 / 0.12);
        font-size: 0.8rem;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.18s ease-in-out, visibility 0.18s ease-in-out;
        z-index: 9999;
    }

    :global(.dark .hm-tip) {
        color: rgb(255 255 255 / 0.85);
    }
</style>
