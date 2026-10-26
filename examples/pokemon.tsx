import { createStore } from "@vyquocvu/rillio/reactive";
import { For, Show, mount, select } from "@vyquocvu/rillio/dom";
import { installSourceViewer } from "./source-viewer.js";

const API = "https://pokeapi.co/api/v2";
const PAGE_SIZE = 24;
const FIRST_PAGE = `${API}/pokemon?limit=${PAGE_SIZE}&offset=0`;

interface PokemonSummary {
  id: number;
  name: string;
}

interface PokemonListResponse {
  count: number;
  next: string | null;
  results: Array<{ name: string; url: string }>;
}

interface PokemonDetail {
  id: number;
  name: string;
  height: number;
  weight: number;
  abilities: Array<{ ability: { name: string }; is_hidden: boolean }>;
  types: Array<{ slot: number; type: { name: string } }>;
  stats: Array<{ base_stat: number; stat: { name: string } }>;
  sprites: {
    other?: { "official-artwork"?: { front_default: string | null } };
    front_default: string | null;
  };
}

const pokemon = createStore<PokemonSummary[]>([]);
const totalCount = createStore(0);
const nextPage = createStore<string | null>(null);
const listLoading = createStore(false);
const listError = createStore<string | null>(null);
const retryUrl = createStore<string | null>(null);
const searchText = createStore("");
const detailOpen = createStore(false);
const selectedPokemon = createStore<PokemonDetail | null>(null);
const detailLoading = createStore(false);
const detailError = createStore<string | null>(null);

const detailCache = new Map<string, PokemonDetail>();
let listController: AbortController | undefined;
let detailController: AbortController | undefined;
let listRequestId = 0;
let detailRequestId = 0;

async function requestJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`PokéAPI returned ${response.status}`);
  return response.json() as Promise<T>;
}

function idFromUrl(url: string): number {
  const match = url.match(/\/pokemon\/(\d+)\/?$/);
  if (!match) throw new Error("PokéAPI returned an unexpected Pokémon URL");
  return Number(match[1]);
}

function artworkUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

async function loadPage(url: string | null, replace = false): Promise<void> {
  if (!url || listLoading.get()) return;
  listController?.abort();
  const controller = new AbortController();
  listController = controller;
  const requestId = ++listRequestId;
  retryUrl.set(url);
  listLoading.set(true);
  listError.set(null);

  try {
    const page = await requestJson<PokemonListResponse>(url, controller.signal);
    if (requestId !== listRequestId) return;
    const rows = page.results.map(result => ({ id: idFromUrl(result.url), name: result.name }));
    pokemon.set(current => replace ? rows : [...current, ...rows]);
    totalCount.set(page.count);
    nextPage.set(page.next);
    retryUrl.set(null);
  } catch (error) {
    if (controller.signal.aborted || requestId !== listRequestId) return;
    listError.set(error instanceof Error ? error.message : "Could not load Pokémon.");
  } finally {
    if (requestId === listRequestId) listLoading.set(false);
  }
}

async function openDetails(identifier: string | number): Promise<void> {
  const key = String(identifier).trim().toLowerCase();
  if (!key) return;
  detailController?.abort();
  const controller = new AbortController();
  detailController = controller;
  const requestId = ++detailRequestId;
  detailOpen.set(true);
  selectedPokemon.set(null);
  detailError.set(null);
  detailLoading.set(true);

  const cached = detailCache.get(key);
  if (cached) {
    selectedPokemon.set(cached);
    detailLoading.set(false);
    return;
  }

  try {
    const detail = await requestJson<PokemonDetail>(
      `${API}/pokemon/${encodeURIComponent(key)}`,
      controller.signal
    );
    if (requestId !== detailRequestId) return;
    detailCache.set(key, detail);
    detailCache.set(String(detail.id), detail);
    detailCache.set(detail.name, detail);
    selectedPokemon.set(detail);
  } catch (error) {
    if (controller.signal.aborted || requestId !== detailRequestId) return;
    detailError.set(error instanceof Error && error.message.includes("404")
      ? "Không tìm thấy Pokémon này. Hãy thử tên hoặc số Pokédex khác."
      : error instanceof Error ? error.message : "Could not load Pokémon details.");
  } finally {
    if (requestId === detailRequestId) detailLoading.set(false);
  }
}

function closeDetails(): void {
  detailRequestId++;
  detailController?.abort();
  detailOpen.set(false);
  detailLoading.set(false);
}

function submitSearch(event: Event): void {
  event.preventDefault();
  void openDetails(searchText.get());
}

function PokemonDetails() {
  const detail = selectedPokemon.get();
  if (!detail) return null;
  const image = detail.sprites.other?.["official-artwork"]?.front_default ?? detail.sprites.front_default ?? artworkUrl(detail.id);

  return (
    <div class="pokemon-detail-layout">
      <div class="pokemon-detail-art">
        <img class="pokemon-detail-image" src={image} alt={`${detail.name} artwork`} />
        <div class="pokemon-detail-types">
          <For each={detail.types} by={item => item.type.name}>
            {item => <span class={`type-chip type-${item.type.name}`}>{item.type.name}</span>}
          </For>
        </div>
      </div>
      <div class="pokemon-detail-copy">
        <p class="detail-kicker">Pokédex entry</p>
        <h2>{detail.name}</h2>
        <p class="detail-number">No. {String(detail.id).padStart(4, "0")}</p>
        <div class="detail-measurements">
          <div><span>Height</span><strong>{(detail.height / 10).toFixed(1)} m</strong></div>
          <div><span>Weight</span><strong>{(detail.weight / 10).toFixed(1)} kg</strong></div>
        </div>
        <h3>Base stats</h3>
        <div class="stat-list">
          <For each={detail.stats} by={item => item.stat.name}>
            {item => (
              <div class="stat-row">
                <span>{item.stat.name.replaceAll("-", " ")}</span>
                <strong>{item.base_stat}</strong>
                <div class="stat-track"><span style={{ width: `${Math.min(item.base_stat, 150) / 150 * 100}%` }} /></div>
              </div>
            )}
          </For>
        </div>
        <h3>Abilities</h3>
        <p class="ability-list">{detail.abilities.map(ability =>
          `${ability.ability.name.replaceAll("-", " ")}${ability.is_hidden ? " · hidden" : ""}`
        ).join(" · ")}</p>
      </div>
    </div>
  );
}

function App() {
  void loadPage(FIRST_PAGE, true);

  return (
    <main class="pokedex-shell">
      <nav class="pokedex-nav">
        <a class="brand" href="/demos.html"><span class="brand-mark">Z</span><span>Rillio examples</span></a>
        <span class="nav-label">Public API demo</span>
      </nav>

      <header class="pokedex-hero">
        <div class="hero-copy">
          <p class="eyebrow">Explore the world of Pokémon</p>
          <h1>Every Pokémon<br /><span>has a story.</span></h1>
          <p class="hero-description">Browse the Pokédex, search by name or number, and open a field guide for stats and abilities.</p>
          <form class="search-form" onSubmit={submitSearch}>
            <span class="search-icon" aria-hidden="true">⌕</span>
            <input
              aria-label="Search Pokémon by name or Pokédex number"
              placeholder="Search Pokémon or # number"
              value={searchText.get()}
              onInput={(event: Event) => searchText.set((event.currentTarget as HTMLInputElement).value)}
            />
            <button type="submit" aria-label="Search">Search</button>
          </form>
          <button class="featured-link" type="button" onClick={() => void openDetails("pikachu")}>
            <span class="featured-dot" /> Meet Pikachu <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div class="hero-orbit orbit-one" />
        <div class="hero-orbit orbit-two" />
        <div class="hero-pokeball" aria-hidden="true"><span /></div>
        <div class="hero-caption"><span>01</span><span>National Pokédex</span></div>
      </header>

      <section class="dex-section" aria-labelledby="dex-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">The collection</p>
            <h2 id="dex-title">Discover Pokémon</h2>
          </div>
          <p class="collection-count"><strong>{select(pokemon, rows => rows.length)}</strong> <span>of</span> <strong>{select(totalCount, count => count.toLocaleString())}</strong> discovered</p>
        </div>

        <Show when={select(listError, Boolean)}>
          <div class="notice notice-error" role="alert">
            <span>{select(listError, value => value ?? "")}</span>
            <button type="button" onClick={() => void loadPage(retryUrl.get() ?? FIRST_PAGE, pokemon.get().length === 0)}>Try again</button>
          </div>
        </Show>

        <Show when={select(listLoading, loading => loading && pokemon.get().length === 0)}>
          <div class="pokemon-grid" aria-label="Loading Pokémon">
            {Array.from({ length: 8 }, (_, index) => <div class="pokemon-skeleton" key={index}><span /><i /><b /></div>)}
          </div>
        </Show>

        <Show when={select(pokemon, rows => rows.length > 0)}>
          <div class="pokemon-grid" id="pokemon-grid">
            <For each={select(pokemon, rows => rows)} by={item => item.id}>
              {item => (
                <button class="pokemon-card" type="button" onClick={() => void openDetails(item.name)} aria-label={`Open ${item.name}`}>
                  <span class="card-number">No. {String(item.id).padStart(4, "0")}</span>
                  <span class="card-art"><img src={artworkUrl(item.id)} alt="" loading="lazy" /></span>
                  <span class="card-name">{item.name}</span>
                  <span class="card-open">View entry <span aria-hidden="true">↗</span></span>
                </button>
              )}
            </For>
          </div>
        </Show>

        <Show when={select(listLoading, Boolean)}>
          <p class="loading-more" role="status">Loading Pokémon…</p>
        </Show>
        <Show when={select(nextPage, Boolean)}>
          <div class="load-more-wrap">
            <button class="load-more" type="button" onClick={() => void loadPage(nextPage.get())}>
              Load more Pokémon <span aria-hidden="true">↓</span>
            </button>
          </div>
        </Show>
      </section>

      <footer class="pokedex-footer">
        <span>Built with Rillio · Data from <a href="https://pokeapi.co/" target="_blank" rel="noreferrer">PokéAPI</a></span>
        <a href="/demos.html">Back to examples</a>
      </footer>

      <Show when={select(detailOpen, Boolean)}>
        <div class="detail-overlay" role="presentation">
          <section class="detail-dialog" role="dialog" aria-modal="true" aria-label="Pokémon details">
            <button class="detail-close" type="button" onClick={closeDetails} aria-label="Close details">×</button>
            <Show when={select(detailLoading, Boolean)}>
              <div class="detail-status" role="status"><span class="spinner" />Finding your Pokémon…</div>
            </Show>
            <Show when={select(detailError, Boolean)}>
              <div class="detail-status detail-status-error" role="alert">{select(detailError, value => value ?? "")}</div>
            </Show>
            <Show when={select(selectedPokemon, Boolean)}>
              <PokemonDetails />
            </Show>
          </section>
        </div>
      </Show>
    </main>
  );
}

const container = document.getElementById("app");
if (container) mount(App, container);
installSourceViewer("pokemon.tsx", () => import("./pokemon.tsx?raw").then(module => module.default));
