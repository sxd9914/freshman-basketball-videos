import { useState, useEffect } from "react";

function App() {
  const [videos, setVideos] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/videos.json")
      .then(res => res.json())
      .then(data => setVideos(data));
  }, []);

  const filtered = videos.filter(v =>
    v.title.toLowerCase().includes(query.toLowerCase()) ||
    v.opponent.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Freshman Basketball Videos</h1>

      <input
        type="text"
        placeholder="Search by opponent, title, etc."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: 300, padding: 8, marginBottom: 20 }}
      />

      {filtered.map(video => (
        <div
          key={video.id}
          style={{
            margin: "20px 0",
            padding: 20,
            border: "1px solid #ddd",
            borderRadius: 8
          }}
        >
          <h3>{video.title}</h3>
          <p>{video.date} – vs {video.opponent}</p>

          <iframe
            width="360"
            height="215"
            src={
              video.videoUrl
                // handle short youtu.be links
                .replace("https://youtu.be/", "https://www.youtube-nocookie.com/embed/")
                // handle full youtube.com/watch?v= links if you ever use them
                .replace("https://www.youtube.com/watch?v=", "https://www.youtube-nocookie.com/embed/")
            }
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            title={video.title}
          />

        </div>
      ))}
    </div>
  );
}

export default App;
