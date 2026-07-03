class DevConsole {
    constructor() {
        this.visible = false;

        this.panel = document.createElement("div");
        this.panel.id = "dev-console";

        Object.assign(this.panel.style, {
            position: "fixed",
            top: "10px",
            left: "10px",
            width: "320px",
            background: "rgba(0,0,0,0.75)",
            color: "#00ff88",
            fontFamily: "monospace",
            fontSize: "13px",
            padding: "10px",
            border: "1px solid #00ff88",
            borderRadius: "6px",
            zIndex: 99999,
            display: "none",
            pointerEvents: "none",
            whiteSpace: "pre"
        });

        document.body.appendChild(this.panel);

		window.addEventListener("keydown", (e) => {
			const togglePressed =
				e.code === "Backquote" ||
				e.code === "Quote" ||
				e.code === "F3";

			if (togglePressed) {
				e.preventDefault();
				this.visible = !this.visible;
				this.panel.style.display = this.visible ? "block" : "none";
			}
		});
    }

    update(data) {

        if (!this.visible) return;

this.panel.textContent =
`KHADIJA'S ARENA DEV

FPS Avg: ${data.fps}
FPS Now: ${data.instantFps}
CPU Frame MS: ${data.frameMs}
Raw Frame MS: ${data.rawFrameMs}
Worst Frame MS: ${data.worstFrameMs}
Last Spike: ${data.lastSpike}

Wave: ${data.wave}
Post FX: ${data.postProcessing}

Actors: ${data.actors}
Enemies: ${data.enemies}
Procedural Zombies: ${data.proceduralVisuals}
Detailed Visuals: ${data.detailedVisuals}

CPU Timings
Player: ${data.playerMs} ms
Enemies: ${data.enemiesMs} ms
Gun/Shops: ${data.weaponMs} ms
Particles/UI: ${data.effectsMs} ms
Minimap/Camera: ${data.minimapMs} ms
Render: ${data.renderMs} ms

Assets
Models: ${data.models}
Asset Textures: ${data.textures}
Audio: ${data.audio}

Renderer
Draw Calls: ${data.drawCalls}
Triangles: ${data.triangles}
GPU Geometries: ${data.gpuGeometries}
GPU Textures: ${data.gpuTextures}`;
    }
}

window.devConsole = new DevConsole();