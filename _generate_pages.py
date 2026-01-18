from pathlib import Path

SITE_TITLE = "Amir Goli"
TAGLINE = "PhD Student, Architectural & Building Technology | University of Kansas"

NAV = """
        <nav class=\"nav\" data-nav>
          <a href=\"index.html\">Home</a>
          <a href=\"about.html\">About</a>
          <a href=\"skills-honors.html\">Skills &amp; Honors</a>
          <a href=\"publications.html\">Publications</a>
          <a href=\"projects/index.html\">Projects</a>
          <a href=\"activities.html\">Activities</a>
          <a href=\"contact.html\">Contact</a>
        </nav>
"""

HEADER_TMPL = """  <header class=\"site-header\">
    <div class=\"header-inner\">
      <h1 class=\"site-title\">{site_title}</h1>
      <p class=\"site-tagline\">{tagline}</p>
    </div>
    <div class=\"nav-wrap\">
      <div class=\"nav-inner\">
        <button class=\"nav-toggle\" type=\"button\" aria-expanded=\"false\" data-nav-toggle>
          <span aria-hidden=\"true\">☰</span>
          Menu
        </button>
{nav}
      </div>
    </div>
  </header>
"""

FOOTER = """  <footer class=\"site-footer\">
    <div class=\"footer-inner\">
      <div>© <span id=\"y\"></span> Amir Goli</div>
      <div><a href=\"{back_href}\">{back_text}</a></div>
    </div>
  </footer>

  <script src=\"assets/js/main.js\"></script>
  <script>
    document.getElementById('y').textContent = new Date().getFullYear();
  </script>
"""

PAGE_TMPL = """<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>{title}</title>
  <meta name=\"description\" content=\"{description}\" />
  <link rel=\"stylesheet\" href=\"assets/css/style.css\" />
</head>
<body>
{header}

  <main class=\"main\">
    <p class=\"kicker\"><a href=\"{root_href}\">{root_label}</a> / {crumb}</p>
    <h2 class=\"page-title\">{h2}</h2>

    <img class=\"hero-img\" src=\"assets/img/placeholder-wide.svg\" alt=\"Project placeholder image\" />

    <div class=\"callout\">
      <p class=\"kicker\">Summary</p>
      <p>{summary}</p>
      <p>{badges}</p>
    </div>

    <section class=\"section\">
      <h2>Overview</h2>
      <p>{overview}</p>
    </section>

    <section class=\"section\">
      <h2>My role</h2>
      <p>{role}</p>
    </section>

    <section class=\"section\">
      <h2>Tools</h2>
      <ul>
{tools}
      </ul>
    </section>

    <section class=\"section\">
      <h2>Outcomes</h2>
      <ul>
{outcomes}
      </ul>
    </section>

    <section class=\"section\">
      <h2>Links</h2>
      <div class=\"card\">
        <p class=\"small\">Add links to a paper, demo video, repository, or slide deck.</p>
        <ul>
{links}
        </ul>
      </div>
    </section>
  </main>

{footer}
</body>
</html>
"""

PROJECTS = [
    {
        "file": "project-1.html",
        "title": "ARTH VR Learning Environment | Amir Goli",
        "description": "Adaptive Reuse Thinking for Housing: a VR learning environment for adaptive reuse design tasks.",
        "crumb": "ARTH VR learning environment",
        "h2": "ARTH VR learning environment",
        "summary": "A Unity-based VR learning environment where learners explore an old factory and develop adaptive reuse designs for housing, supported by interaction modes and a structured user study workflow.",
        "badges": "<span class=\"badge\">VR</span> <span class=\"badge\">Education</span> <span class=\"badge\">Unity</span>",
        "overview": "This project focuses on turning an adaptive reuse design task into an immersive VR experience. The environment supports exploratory learning, design iteration, and data collection for usability and engagement analysis.",
        "role": "VR developer and researcher. Built interactions, content structure, and study-ready instrumentation for evaluation.",
        "tools": ["Unity", "C#", "XR interaction patterns", "Quest headset deployment"],
        "outcomes": [
            "VR prototype that supports an adaptive reuse scenario from initial exploration to design decisions",
            "Reusable interaction patterns for placement, editing, and mode switching",
            "Foundation for usability and engagement measurement"
        ],
        "links": [
            ("Related paper", "publications.html"),
            ("Portfolio entry", "portfolio.html")
        ],
    },
    {
        "file": "project-2.html",
        "title": "Architectural Design Serious Game | Amir Goli",
        "description": "A multimodal serious game for architectural education using Leap Motion, machine vision, and a voice assistant.",
        "crumb": "Architectural design serious game",
        "h2": "Architectural design serious game",
        "summary": "A serious game approach that integrates multiple interaction modalities to support teaching and learning in architectural design.",
        "badges": "<span class=\"badge\">Serious games</span> <span class=\"badge\">HCI</span> <span class=\"badge\">Multimodal</span>",
        "overview": "The project explores how multimodal interaction can make design learning more engaging. The system connects gesture input, machine vision cues, and voice interaction to support tasks inside a CAD-like workflow.",
        "role": "System designer and developer. Integrated interaction components and designed the learning flow.",
        "tools": ["Leap Motion", "Computer vision pipeline", "Voice assistant integration", "CAD workflow prototyping"],
        "outcomes": [
            "Working multimodal prototype for design learning",
            "Empirical grounding through a peer reviewed journal article",
            "Clear interaction mapping for future classroom deployment"
        ],
        "links": [
            ("Paper (Education and Information Technologies)", "https://doi.org/10.1007/s10639-022-11062-z"),
        ],
    },
    {
        "file": "project-3.html",
        "title": "Parametric Topology Optimization | Amir Goli",
        "description": "Parametric structural topology optimization of high-rise buildings considering wind and gravity loads.",
        "crumb": "Parametric topology optimization",
        "h2": "Parametric topology optimization",
        "summary": "A performance-driven workflow combining parametric modeling with topology optimization (BESO) for high-rise structural design under wind and gravity loads.",
        "badges": "<span class=\"badge\">Optimization</span> <span class=\"badge\">Structures</span> <span class=\"badge\">Parametric</span>",
        "overview": "The goal is to explore structural systems efficiently by linking parametric inputs to an optimization loop. Wind and gravity loads guide material distribution and structural form exploration.",
        "role": "Workflow builder and analyst. Supported modeling, optimization setup, and result interpretation.",
        "tools": ["Rhinoceros + Grasshopper", "Optimization workflow (BESO)", "Structural modeling"],
        "outcomes": [
            "End-to-end pipeline from parametric inputs to optimized structural topology",
            "Publication in Journal of Architectural Engineering",
            "Transferable approach for early-stage structural exploration"
        ],
        "links": [
            ("Paper (Journal of Architectural Engineering)", "https://doi.org/10.1061/(asce)ae.1943-5568.0000511"),
        ],
    },
    {
        "file": "project-4.html",
        "title": "Climate Responsive Facade Prototype | Amir Goli",
        "description": "A climate-responsive facade concept inspired by the chameleon eye.",
        "crumb": "Climate responsive facade prototype",
        "h2": "Climate responsive facade prototype",
        "summary": "A biomimicry-inspired facade prototype that adapts to climate conditions, informed by sun path analysis and simulation-driven design iterations.",
        "badges": "<span class=\"badge\">Sustainability</span> <span class=\"badge\">Simulation</span> <span class=\"badge\">Biomimicry</span>",
        "overview": "This project studies how responsive facade behavior can improve comfort and performance. The concept uses a chameleon eye as inspiration and links motion patterns to environmental inputs.",
        "role": "Designer and computational modeler. Developed form logic, ran simulations, and iterated the prototype.",
        "tools": ["Grasshopper", "Environmental simulation", "Parametric iteration"],
        "outcomes": [
            "Prototype facade logic aligned with climate inputs",
            "Demonstration of simulation-supported iteration",
            "A clear concept narrative suitable for portfolio presentation"
        ],
        "links": [
            ("Portfolio entry", "portfolio.html"),
        ],
    },
    {
        "file": "project-5.html",
        "title": "WS-Snake Grasshopper Tool | Amir Goli",
        "description": "WS-Snake: a Grasshopper tool for wind pressure calculations on tall building facades.",
        "crumb": "WS-Snake Grasshopper tool",
        "h2": "WS-Snake Grasshopper tool",
        "summary": "A Grasshopper-based tool that estimates facade wind pressures based on height and orientation to support early-stage facade design decisions.",
        "badges": "<span class=\"badge\">Grasshopper</span> <span class=\"badge\">Wind</span> <span class=\"badge\">Automation</span>",
        "overview": "The tool targets fast feedback for facade design by turning wind considerations into accessible parametric outputs. It helps designers check pressures and compare options without slowing down concept work.",
        "role": "Tool developer. Designed the workflow and packaged it for reuse.",
        "tools": ["Grasshopper", "Wind pressure logic", "Parametric interfaces"],
        "outcomes": [
            "Reusable GH tool that automates wind pressure estimation",
            "A workflow that supports teaching and practice-oriented exploration",
            "Improved speed in early-stage facade evaluation"
        ],
        "links": [
            ("Demo placeholder", "#"),
        ],
    },
    {
        "file": "project-6.html",
        "title": "Curtain Wall Automation Pipeline | Amir Goli",
        "description": "Rule-based curtain wall geometry + automated shop drawings and takeoffs (Rhino, Grasshopper, Python).",
        "crumb": "Curtain wall automation pipeline",
        "h2": "Curtain wall automation pipeline",
        "summary": "A workflow that generates curtain wall geometry and automates documentation outputs such as shop drawings and material takeoffs.",
        "badges": "<span class=\"badge\">Automation</span> <span class=\"badge\">Documentation</span> <span class=\"badge\">Python</span>",
        "overview": "This project bridges design and construction documentation by using rule-based parametric modeling to standardize curtain wall generation and downstream drawing outputs.",
        "role": "Workflow designer. Coordinated geometry rules and supported automated outputs.",
        "tools": ["Rhinoceros + Grasshopper", "Python scripting", "Documentation templates"],
        "outcomes": [
            "More consistent curtain wall generation across design variations",
            "Reduced time spent on repetitive documentation tasks",
            "Clear pipeline structure that can be extended to other facade systems"
        ],
        "links": [
            ("Portfolio entry", "portfolio.html"),
        ],
    },
]


PORTFOLIO = [
    {
        "file": "portfolio-1.html",
        "title": "Portfolio | VR Demo Reel | Amir Goli",
        "description": "Portfolio mock page: VR demo reel.",
        "crumb": "VR demo reel",
        "h2": "VR demo reel",
        "summary": "A placeholder page for a short demo reel of VR projects (screen recording + captions + links).",
        "badges": "<span class=\"badge\">Portfolio</span> <span class=\"badge\">VR</span>",
        "overview": "Replace the placeholder image with a still from your video. Add a short paragraph describing the scenario, interactions, and what you learned.",
        "role": "Creator and editor. Capture, script, and narrate the demo in under 90 seconds.",
        "tools": ["Unity capture", "Video editing", "Captioning"],
        "outcomes": [
            "A concise artifact that communicates your work quickly",
            "Direct links to related papers or repositories",
            "Clear story: context, contribution, result"
        ],
        "links": [("Back to Portfolio", "portfolio.html")],
    },
    {
        "file": "portfolio-2.html",
        "title": "Portfolio | Research Figures | Amir Goli",
        "description": "Portfolio mock page: research figures and diagrams.",
        "crumb": "Research figures",
        "h2": "Research figures",
        "summary": "A placeholder page to showcase figures and diagrams from papers, proposals, and posters.",
        "badges": "<span class=\"badge\">Portfolio</span> <span class=\"badge\">Research</span>",
        "overview": "Add 3 to 5 key figures (with captions) that show your contribution: study design, interface, pipeline, or results.",
        "role": "Designer and author. Focus on clarity, typography, and consistent visual language.",
        "tools": ["Illustration tools", "InDesign", "PowerPoint"],
        "outcomes": [
            "Recruiters and committees see your thinking, not just final visuals",
            "Reusable visuals for talks and proposals",
            "A fast way to communicate scope and rigor"
        ],
        "links": [("Back to Portfolio", "portfolio.html")],
    },
    {
        "file": "portfolio-3.html",
        "title": "Portfolio | Fabrication Work | Amir Goli",
        "description": "Portfolio mock page: digital fabrication.",
        "crumb": "Fabrication work",
        "h2": "Fabrication work",
        "summary": "A placeholder page for fabrication projects (laser cutting, CNC, 3D printing) with process photos.",
        "badges": "<span class=\"badge\">Portfolio</span> <span class=\"badge\">Fabrication</span>",
        "overview": "Show the pipeline from digital model to machine setup to final assembly. Include constraints and what you optimized.",
        "role": "Fabrication lead. Document planning, toolpaths, iterations, and assembly steps.",
        "tools": ["Laser cutter", "CNC", "3D printing"],
        "outcomes": [
            "Evidence of hands-on making and troubleshooting",
            "Clear link between computation and material outcomes",
            "Strong visual story for a portfolio"
        ],
        "links": [("Back to Portfolio", "portfolio.html")],
    },
    {
        "file": "portfolio-4.html",
        "title": "Portfolio | Computational Design | Amir Goli",
        "description": "Portfolio mock page: computational design workflows.",
        "crumb": "Computational design",
        "h2": "Computational design",
        "summary": "A placeholder page to present parametric workflows, custom tools, and analysis-driven design.",
        "badges": "<span class=\"badge\">Portfolio</span> <span class=\"badge\">Grasshopper</span>",
        "overview": "Add screenshots of definitions, inputs and outputs, and one final render. Explain the rule set and what it enables.",
        "role": "Tool builder and designer. Prioritize reproducibility and clear parameterization.",
        "tools": ["Rhino", "Grasshopper", "Python"],
        "outcomes": [
            "Demonstrates logic and rigor",
            "Shows how you turn goals into workflows",
            "Makes it easier for others to understand and reuse your methods"
        ],
        "links": [("Back to Portfolio", "portfolio.html")],
    },
    {
        "file": "portfolio-5.html",
        "title": "Portfolio | Teaching Artifacts | Amir Goli",
        "description": "Portfolio mock page: teaching materials.",
        "crumb": "Teaching artifacts",
        "h2": "Teaching artifacts",
        "summary": "A placeholder page for teaching materials: assignment briefs, rubrics, and example feedback.",
        "badges": "<span class=\"badge\">Portfolio</span> <span class=\"badge\">Teaching</span>",
        "overview": "Include one short assignment, a rubric, and 2 to 3 examples of constructive feedback. Keep it concise.",
        "role": "Instructor or TA. Focus on learning outcomes and assessment clarity.",
        "tools": ["Rubric design", "Slides", "Learning platforms"],
        "outcomes": [
            "Evidence of communication and mentoring",
            "Reusable teaching toolkit",
            "Clear alignment between goals and evaluation"
        ],
        "links": [("Back to Portfolio", "portfolio.html")],
    },
    {
        "file": "portfolio-6.html",
        "title": "Portfolio | Writing Samples | Amir Goli",
        "description": "Portfolio mock page: writing samples.",
        "crumb": "Writing samples",
        "h2": "Writing samples",
        "summary": "A placeholder page that links to a short research statement, proposal excerpt, or manuscript section.",
        "badges": "<span class=\"badge\">Portfolio</span> <span class=\"badge\">Writing</span>",
        "overview": "Provide one page per writing sample. Use clear headings and include links to published versions when possible.",
        "role": "Author. Keep the sample focused and self-contained.",
        "tools": ["Word or LaTeX", "Reference management"],
        "outcomes": [
            "Shows your thinking and framing",
            "Supports scholarship and funding applications",
            "Complements visual work with narrative clarity"
        ],
        "links": [("Back to Portfolio", "portfolio.html")],
    },
]


def li(items):
    return "\n".join(f"        <li>{i}</li>" for i in items)


def link_items(items):
    out = []
    for text, href in items:
        attrs = " target=\"_blank\" rel=\"noopener\"" if href.startswith("http") else ""
        out.append(f"          <li><a href=\"{href}\"{attrs}>{text}</a></li>")
    return "\n".join(out) if out else "          <li><span class=\"small\">Add links here.</span></li>"


root = Path(__file__).resolve().parent
header = HEADER_TMPL.format(site_title=SITE_TITLE, tagline=TAGLINE, nav=NAV.rstrip())

for p in PROJECTS:
    html = PAGE_TMPL.format(
        title=p["title"],
        description=p["description"].replace('"', '&quot;'),
        header=header,
        crumb=p["crumb"],
        root_href="projects/index.html",
        root_label="Projects",
        h2=p["h2"],
        summary=p["summary"],
        badges=p["badges"],
        overview=p["overview"],
        role=p["role"],
        tools=li(p["tools"]),
        outcomes=li(p["outcomes"]),
        links=link_items(p.get("links", [])),
        footer=FOOTER.format(back_href="projects/index.html", back_text="Back to Projects"),
    )
    (root / p["file"]).write_text(html, encoding="utf-8")

print("Generated", len(PROJECTS), "project pages")

for item in PORTFOLIO:
    html = PAGE_TMPL.format(
        title=item["title"],
        description=item["description"].replace('"', '&quot;'),
        header=header,
        crumb=item["crumb"],
        root_href="portfolio.html",
        root_label="Portfolio",
        h2=item["h2"],
        summary=item["summary"],
        badges=item["badges"],
        overview=item["overview"],
        role=item["role"],
        tools=li(item["tools"]),
        outcomes=li(item["outcomes"]),
        links=link_items(item.get("links", [])),
        footer=FOOTER.format(back_href="portfolio.html", back_text="Back to Portfolio"),
    )
    (root / item["file"]).write_text(html, encoding="utf-8")

print("Generated", len(PORTFOLIO), "portfolio pages")
