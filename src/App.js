import React, { useState, useEffect, useMemo } from "react";

// Helper: extract YouTube video ID from different URL formats
function getYouTubeId(url) {
  if (!url) return "";
  try {
    // Short youtu.be links
    if (url.includes("youtu.be/")) {
      return url.split("youtu.be/")[1].split(/[?&#]/)[0];
    }
    // Full youtube.com/watch?v=
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v") || "";
    }
  } catch (e) {
    console.warn("Invalid YouTube URL:", url);
  }
  return "";
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const YT_STATS_URL = "https://basketball-yt-stats-satish.azurewebsites.net/api/GetYouTubeStats";

const PLAYLIST_API_URL =
  "https://basketball-yt-stats-satish.azurewebsites.net/api/GetPlaylistVideos"; 
const PLAYLIST_ID = "PLRY5pRvItPFXx8bIvugFmMLMFWgZaHRJd";     // replace with actual ID


function App() {
  const [videos, setVideos] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedOpponent, setSelectedOpponent] = useState("all");
  const [tagFilter, setTagFilter] = useState("all"); // all | full | highlights
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState("all");
  const [sortBy, setSortBy] = useState("dateDesc"); // dateDesc | dateAsc | opponent | viewsDesc

 useEffect(() => {
  async function loadVideosAndStats() {
    try {
      // 1) Load videos from YouTube playlist via Azure Function
      console.log("Loading playlist videos...");
      const playlistRes = await fetch(
        `${PLAYLIST_API_URL}?playlistId=${encodeURIComponent(PLAYLIST_ID)}`
      );
      if (!playlistRes.ok) {
        console.error(
          "Failed to load playlist videos:",
          playlistRes.status,
          await playlistRes.text()
        );
        return;
      }

      const playlistData = await playlistRes.json();
      console.log("Playlist videos:", playlistData);

      // Sort newest -> oldest
      const sorted = [...playlistData].sort(
        (a, b) => new Date(b.date || 0) - new Date(a.date || 0)
      );

      // 2) Collect unique YouTube IDs
      const ids = sorted
        .map((v) => getYouTubeId(v.videoUrl))
        .filter(Boolean);
      const uniqueIds = Array.from(new Set(ids));
      console.log("Unique IDs for stats:", uniqueIds);

      let statsMap = {};
      if (uniqueIds.length > 0 && YT_STATS_URL) {
        try {
          const statsUrl = `${YT_STATS_URL}?ids=${encodeURIComponent(
            uniqueIds.join(",")
          )}`;
          console.log("Calling stats API:", statsUrl);

          const statsRes = await fetch(statsUrl);
          const statsText = await statsRes.clone().text();

          if (statsRes.ok) {
            statsMap = JSON.parse(statsText);
            console.log("Stats map:", statsMap);
          } else {
            console.warn(
              "Failed to fetch stats:",
              statsRes.status,
              statsText
            );
          }
        } catch (err) {
          console.warn("Error fetching YouTube stats:", err);
        }
      }

      // 3) Merge stats into videos
      const merged = sorted.map((v) => {
        const id = getYouTubeId(v.videoUrl);
        const dynamicViews =
          id && statsMap[id] != null ? Number(statsMap[id]) : v.viewCount;

        return {
          ...v,
          viewCount:
            typeof dynamicViews === "number" && !Number.isNaN(dynamicViews)
              ? dynamicViews
              : 0,
        };
      });

      console.log("Final merged videos:", merged);

      setVideos(merged);
      if (merged.length > 0) {
        setSelectedVideoId(merged[0].id);
      }
    } catch (err) {
      console.error("Error loading playlist videos or stats:", err);
    }
  }

  loadVideosAndStats();
}, []);

// Auto-refresh YouTube view counts every 10 minutes
useEffect(() => {
  if (!YT_STATS_URL || videos.length === 0) return;

  const interval = setInterval(async () => {
    try {
      const ids = Array.from(
        new Set(
          videos
            .map((v) => getYouTubeId(v.videoUrl))
            .filter(Boolean)
        )
      );
      if (ids.length === 0) return;

      const joinChar = YT_STATS_URL.includes("?") ? "&" : "?";
      const statsRes = await fetch(
        `${YT_STATS_URL}${joinChar}ids=${encodeURIComponent(ids.join(","))}`
      );
      if (!statsRes.ok) return;

      const statsMap = await statsRes.json();

      setVideos((current) =>
        current.map((v) => {
          const id = getYouTubeId(v.videoUrl);
          if (!id || statsMap[id] == null) return v;
          return {
            ...v,
            viewCount: Number(statsMap[id]),
          };
        })
      );
    } catch (err) {
      console.warn("Auto-refresh stats error:", err);
    }
  }, 10 * 60 * 1000); // 10 minutes

  return () => clearInterval(interval);
}, [videos]);

  // Build list of unique opponents for dropdown
  const opponents = useMemo(() => {
    const set = new Set();
    videos.forEach((v) => {
      if (v.opponent) set.add(v.opponent);
    });
    return ["all", ...Array.from(set).sort()];
  }, [videos]);

  const seasons = useMemo(() => {
  const set = new Set();
  videos.forEach((v) => {
    if (v.season) set.add(v.season);
  });
  return ["all", ...Array.from(set).sort()];
  }, [videos]);

  // Apply all filters + search
const filteredVideos = useMemo(() => {
  const base = videos.filter((v) => {
    const q = query.trim().toLowerCase();
    const matchesSearch =
      !q ||
      v.title.toLowerCase().includes(q) ||
      (v.opponent || "").toLowerCase().includes(q) ||
      (v.notes || "").toLowerCase().includes(q);

    const matchesOpponent =
      selectedOpponent === "all" || v.opponent === selectedOpponent;

    const matchesSeason =
      selectedSeason === "all" || v.season === selectedSeason;

    const tagsLower = (v.tags || []).map((t) => t.toLowerCase());
    const matchesTag =
      tagFilter === "all"
        ? true
        : tagFilter === "full"
        ? tagsLower.includes("full game")
        : tagFilter === "highlights"
        ? tagsLower.includes("highlights")
        : true;

    return matchesSearch && matchesOpponent && matchesSeason && matchesTag;
  });

  // sort
  const sorted = [...base].sort((a, b) => {
    if (sortBy === "dateAsc") {
      return new Date(a.date || 0) - new Date(b.date || 0);
    }
    if (sortBy === "dateDesc") {
      return new Date(b.date || 0) - new Date(a.date || 0);
    }
    if (sortBy === "opponent") {
      return (a.opponent || "").localeCompare(b.opponent || "");
    }
    if (sortBy === "viewsDesc") {
      const va = a.viewCount || 0;
      const vb = b.viewCount || 0;
      return vb - va;
    }
    return 0;
  });

  return sorted;
}, [
  videos,
  query,
  selectedOpponent,
  selectedSeason,
  tagFilter,
  sortBy,
]);

  const selectedVideo = filteredVideos.find((v) => v.id === selectedVideoId) ||
    filteredVideos[0] ||
    null;

  // If filters change and selected video disappears, pick first in list
  useEffect(() => {
    if (filteredVideos.length === 0) {
      setSelectedVideoId(null);
      return;
    }
    if (!selectedVideo || !filteredVideos.some((v) => v.id === selectedVideoId)) {
      setSelectedVideoId(filteredVideos[0].id);
    }
  }, [filteredVideos, selectedVideo, selectedVideoId]);

const pageStyles = {
  fontFamily:
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  backgroundColor: "#020617", // near-black
  minHeight: "100vh",
  margin: 0,
  padding: 0,
  color: "#e5e7eb",
};

const containerStyles = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: "24px 16px 40px",
};

const cardStyles = {
  background:
    "radial-gradient(circle at top left, #22c55e20, #020617 55%, #0f172a 100%)",
  borderRadius: 16,
  border: "1px solid #1f2937",
  boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
  padding: 20,
  marginBottom: 16,
};
const baseChipStyles = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  marginRight: 6,
};

function chipStylesForTag(tag) {
  const t = tag.toLowerCase();
  if (t.includes("full game")) {
    return {
      ...baseChipStyles,
      backgroundColor: "#166534",
      color: "#bbf7d0",
      border: "1px solid #22c55e",
    };
  }
  if (t.includes("highlights")) {
    return {
      ...baseChipStyles,
      backgroundColor: "#facc15",
      color: "#000000",
      border: "1px solid #f97316",
    };
  }
  return {
    ...baseChipStyles,
    backgroundColor: "#1f2937",
    color: "#e5e7eb",
    border: "1px solid #4b5563",
  };
}
  

  return (
    <div style={pageStyles}>
      <div style={containerStyles}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 28 }}>
            Freshman Basketball Videos
          </h1>
          <p style={{ margin: 0, color: "#555" }}>
            De La Salle | Games & Highlights | {new Date().getFullYear()}
          </p>
        </header>

        {/* Filters + search */}
        <div
          style={{
            ...cardStyles,
            marginBottom: 24,
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "center",
          }}
        >
          <input
            type="text"
            placeholder="Search opponent, title, notes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: "1 1 220px",
              minWidth: 220,
              padding: 8,
              borderRadius: 8,
              border: "1px solid #ccc",
              fontSize: 14,
            }}
          />

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
  {/* Opponent */}
  <div>
    <label
      style={{ fontSize: 12, textTransform: "uppercase", color: "#94a3b8" }}
    >
      Opponent
    </label>
    <br />
    <select
      value={selectedOpponent}
      onChange={(e) => setSelectedOpponent(e.target.value)}
      style={{
        padding: 8,
        borderRadius: 8,
        border: "1px solid #334155",
        minWidth: 140,
        backgroundColor: "#020617",
        color: "white",
      }}
    >
      {opponents.map((opp) => (
        <option key={opp} value={opp}>
          {opp === "all" ? "All opponents" : opp}
        </option>
      ))}
    </select>
  </div>

  {/* Season */}
  <div>
    <label
      style={{ fontSize: 12, textTransform: "uppercase", color: "#94a3b8" }}
    >
      Season
    </label>
    <br />
    <select
      value={selectedSeason}
      onChange={(e) => setSelectedSeason(e.target.value)}
      style={{
        padding: 8,
        borderRadius: 8,
        border: "1px solid #334155",
        minWidth: 140,
        backgroundColor: "#020617",
        color: "white",
      }}
    >
      {seasons.map((s) => (
        <option key={s} value={s}>
          {s === "all" ? "All seasons" : s}
        </option>
      ))}
    </select>
  </div>

  {/* Type */}
  <div>
    <label
      style={{ fontSize: 12, textTransform: "uppercase", color: "#94a3b8" }}
    >
      Type
    </label>
    <br />
    <select
      value={tagFilter}
      onChange={(e) => setTagFilter(e.target.value)}
      style={{
        padding: 8,
        borderRadius: 8,
        border: "1px solid #334155",
        minWidth: 140,
        backgroundColor: "#020617",
        color: "white",
      }}
    >
      <option value="all">All</option>
      <option value="full">Full games only</option>
      <option value="highlights">Highlights only</option>
    </select>
  </div>

  {/* Sort */}
  <div>
    <label
      style={{ fontSize: 12, textTransform: "uppercase", color: "#94a3b8" }}
    >
      Sort
    </label>
    <br />
    <select
      value={sortBy}
      onChange={(e) => setSortBy(e.target.value)}
      style={{
        padding: 8,
        borderRadius: 8,
        border: "1px solid #334155",
        minWidth: 160,
        backgroundColor: "#020617",
        color: "white",
      }}
    >
      <option value="dateDesc">Newest first</option>
      <option value="dateAsc">Oldest first</option>
      <option value="opponent">Opponent (A–Z)</option>
      <option value="viewsDesc">Most viewed</option>
    </select>
  </div>
</div>

        </div>

        {/* Selected video player */}
        {selectedVideo && (
          <div style={{ ...cardStyles, marginBottom: 24 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              <div style={{ flex: "1 1 360px", minWidth: 320 }}>
  {(() => {
    const vidId = getYouTubeId(selectedVideo.videoUrl);
    const thumbUrl = vidId
      ? `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`
      : null;

    // Single behavior for ALL platforms: clickable thumbnail that opens YouTube
    return (
      <div
        style={{
          position: "relative",
          paddingBottom: "56.25%",
          height: 0,
          overflow: "hidden",
          borderRadius: 12,
          backgroundColor: "#000",
          cursor: "pointer",
        }}
        onClick={() =>
          window.open(
            selectedVideo.videoUrl,
            "_blank",
            "noopener,noreferrer"
          )
        }
      >
        {thumbUrl && (
          <img
            src={thumbUrl}
            alt={selectedVideo.title}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: 12,
            }}
          />
        )}
        {/* Play overlay */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 64,
            height: 64,
            borderRadius: "50%",
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderTop: "10px solid transparent",
              borderBottom: "10px solid transparent",
              borderLeft: "18px solid white",
              marginLeft: 4,
            }}
          />
        </div>
      </div>
    );
  })()}
</div>

              <div style={{ flex: "1 1 260px", minWidth: 260 }}>
                <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>
                  {selectedVideo.title}
                </h2>
                <p style={{ margin: "0 0 4px", color: "#555", fontSize: 14 }}>
                  {formatDate(selectedVideo.date)} · vs {selectedVideo.opponent} · Season{" "}
                  {selectedVideo.season}
                </p>
                <p style={{ margin: "0 0 8px", color: "#777", fontSize: 13 }}>
                  {selectedVideo.notes || ""}
                </p>

                {/* tags */}
                <div style={{ marginBottom: 10 }}>
                  {(selectedVideo.tags || []).map((tag) => (
                    <span key={tag} style={chipStylesForTag(tag)}>
                      {tag}
                    </span>
                  ))}
                </div>


                {/* view count */}
                <p style={{ margin: "0 0 12px", color: "#555", fontSize: 13 }}>
                  Views:{" "}
                  {typeof selectedVideo.viewCount === "number"
                    ? selectedVideo.viewCount.toLocaleString()
                    : "—"}
                </p>

                {/* Buttons */}
                
              </div>
            </div>
          </div>
        )}

{/* Grid of videos (SMALL thumbnails) */}
<div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 12,
  }}
>
  {filteredVideos.map((video) => {
    const videoId = getYouTubeId(video.videoUrl);
    const thumbUrl = videoId
      ? `https://img.youtube.com/vi/${videoId}/default.jpg` // VERY SMALL thumbnail
      : null;

    const isSelected = video.id === selectedVideoId;

    return (
      <div
        key={video.id}
        style={{
          backgroundColor: "#fff",
          borderRadius: 8,
          cursor: "pointer",
          border: isSelected
            ? "2px solid #2563eb"
            : "1px solid rgba(0,0,0,0.1)",
          padding: 4,
          width: "100%",
          maxWidth: 140,      // HARD CAP thumbnail width
          justifySelf: "center",
        }}
        onClick={() => setSelectedVideoId(video.id)}
      >
        {thumbUrl && (
          <img
            src={thumbUrl}
            alt={video.title}
            style={{
              width: "100%",    // fill the tiny card
              height: 70,       // fixed short height
              objectFit: "cover",
              borderRadius: 4,
              marginBottom: 4,
            }}
          />
        )}

        <h3
          style={{
            margin: 0,
            fontSize: 11,
            lineHeight: 1.2,
            height: 28,
            overflow: "hidden",
          }}
        >
          {video.title}
        </h3>

        <p style={{ margin: 0, fontSize: 9, color: "#666" }}>
          {formatDate(video.date)}
        </p>
      </div>
    );
  })}
</div>



        {filteredVideos.length === 0 && (
          <p style={{ marginTop: 16, color: "#777" }}>
            No videos match your filters yet.
          </p>
        )}
      </div>
    </div>
  );
}

export default App;
