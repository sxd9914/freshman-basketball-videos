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

const isIOS =
  typeof navigator !== "undefined" &&
  /iPhone|iPad|iPod/i.test(navigator.userAgent);

const YT_STATS_URL = "https://basketball-yt-stats-satish.azurewebsites.net/api/GetYouTubeStats";

function App() {
  const [videos, setVideos] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedOpponent, setSelectedOpponent] = useState("all");
  const [tagFilter, setTagFilter] = useState("all"); // all | full | highlights
  const [selectedVideoId, setSelectedVideoId] = useState(null);

  useEffect(() => {
  async function loadVideosAndStats() {
    try {
      console.log("Loading videos.json...");
      const res = await fetch("/videos.json");
      const data = await res.json();
      console.log("Raw videos.json data:", data);

      // Sort newest -> oldest
      const sorted = [...data].sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );

      // Collect unique YouTube IDs
      const ids = sorted
        .map((v) => {
          const id = getYouTubeId(v.videoUrl);
          if (!id) {
            console.warn("No YouTube ID for video:", v);
          }
          return id;
        })
        .filter(Boolean);
      const uniqueIds = Array.from(new Set(ids));
      console.log("Unique YouTube IDs for stats:", uniqueIds);

      let statsMap = {};
      if (uniqueIds.length > 0 && YT_STATS_URL) {
        try {
          const url = `${YT_STATS_URL}?ids=${encodeURIComponent(
            uniqueIds.join(",")
          )}`;
          console.log("Calling stats API:", url);

          const statsRes = await fetch(url);
          const textClone = await statsRes.clone().text(); // for debugging

          if (statsRes.ok) {
            try {
              statsMap = JSON.parse(textClone);
              console.log("Stats map from API:", statsMap);
            } catch (parseErr) {
              console.error("Failed to parse stats JSON:", parseErr, textClone);
            }
          } else {
            console.warn(
              "Failed to fetch YouTube stats:",
              statsRes.status,
              textClone
            );
          }
        } catch (err) {
          console.warn("Error fetching YouTube stats:", err);
        }
      } else {
        console.log("No IDs or YT_STATS_URL missing, skipping stats call.");
      }

      // Merge viewCount
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

      console.log("Merged videos with viewCount:", merged);

      setVideos(merged);
      if (merged.length > 0) {
        setSelectedVideoId(merged[0].id);
      }
    } catch (err) {
      console.error("Error loading videos.json or stats:", err);
    }
  }

  loadVideosAndStats();
}, []);



  // Build list of unique opponents for dropdown
  const opponents = useMemo(() => {
    const set = new Set();
    videos.forEach((v) => {
      if (v.opponent) set.add(v.opponent);
    });
    return ["all", ...Array.from(set).sort()];
  }, [videos]);

  // Apply all filters + search
  const filteredVideos = useMemo(() => {
    return videos.filter((v) => {
      const q = query.trim().toLowerCase();
      const matchesSearch =
        !q ||
        v.title.toLowerCase().includes(q) ||
        (v.opponent || "").toLowerCase().includes(q) ||
        (v.notes || "").toLowerCase().includes(q);

      const matchesOpponent =
        selectedOpponent === "all" || v.opponent === selectedOpponent;

      const tags = (v.tags || []).map((t) => t.toLowerCase());

      const matchesTag =
        tagFilter === "all"
          ? true
          : tagFilter === "full"
          ? tags.includes("full game")
          : tagFilter === "highlights"
          ? tags.includes("highlights")
          : true;

      return matchesSearch && matchesOpponent && matchesTag;
    });
  }, [videos, query, selectedOpponent, tagFilter]);

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
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    backgroundColor: "#f5f5f5",
    minHeight: "100vh",
    margin: 0,
    padding: 0,
  };

  const containerStyles = {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "24px 16px 40px",
  };

  const cardStyles = {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
    padding: 20,
    marginBottom: 16,
  };

  const buttonStyles = {
    padding: "8px 14px",
    borderRadius: 999,
    border: "1px solid #ccc",
    backgroundColor: "#fff",
    cursor: "pointer",
    fontSize: 13,
  };

  const primaryButtonStyles = {
    ...buttonStyles,
    border: "none",
    backgroundColor: "#2563eb",
    color: "#fff",
  };

  const chipStyles = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    backgroundColor: "#eef2ff",
    color: "#4f46e5",
    marginRight: 6,
  };

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
            <div>
              <label
                style={{ fontSize: 12, textTransform: "uppercase", color: "#777" }}
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
                  border: "1px solid #ccc",
                  minWidth: 140,
                }}
              >
                {opponents.map((opp) => (
                  <option key={opp} value={opp}>
                    {opp === "all" ? "All opponents" : opp}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                style={{ fontSize: 12, textTransform: "uppercase", color: "#777" }}
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
                  border: "1px solid #ccc",
                  minWidth: 140,
                }}
              >
                <option value="all">All</option>
                <option value="full">Full games only</option>
                <option value="highlights">Highlights only</option>
              </select>
            </div>
          </div>
        </div>

        {/* Selected video player */}
        {selectedVideo && (
          <div style={{ ...cardStyles, marginBottom: 24 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              <div style={{ flex: "1 1 360px", minWidth: 320 }}>
                {/* Embedded player */}
              {(() => {
                const vidId = getYouTubeId(selectedVideo.videoUrl);
                const thumbUrl = vidId
                  ? `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`
                  : null;

                // --- iOS FALLBACK: Thumbnail + tap to open YouTube ---
                if (isIOS) {
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
                }

    // --- NON-iOS: Regular embedded player ---
    return (
      <div
        style={{
          position: "relative",
          paddingBottom: "56.25%",
          height: 0,
          overflow: "hidden",
          borderRadius: 12,
          backgroundColor: "#000",
        }}
      >
        <iframe
          title={selectedVideo.title}
          src={`https://www.youtube.com/embed/${vidId}`}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            border: 0,
            borderRadius: 12,
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  })()}

              </div>

              <div style={{ flex: "1 1 260px", minWidth: 260 }}>
                <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>
                  {selectedVideo.title}
                </h2>
                <p style={{ margin: "0 0 4px", color: "#555", fontSize: 14 }}>
                  {selectedVideo.date} · vs {selectedVideo.opponent} · Season{" "}
                  {selectedVideo.season}
                </p>
                <p style={{ margin: "0 0 8px", color: "#777", fontSize: 13 }}>
                  {selectedVideo.notes || ""}
                </p>

                {/* tags */}
                <div style={{ marginBottom: 10 }}>
                  {(selectedVideo.tags || []).map((tag) => (
                    <span key={tag} style={chipStyles}>
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
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a
                    href={selectedVideo.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <button style={primaryButtonStyles}>Watch on YouTube</button>
                  </a>
                  <button
                    style={buttonStyles}
                    onClick={() => {
                      const videoId = getYouTubeId(selectedVideo.videoUrl);
                      if (videoId) {
                        const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                        window.open(thumbUrl, "_blank", "noopener,noreferrer");
                      }
                    }}
                  >
                    Open thumbnail
                  </button>
                </div>
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
          {video.date}
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
