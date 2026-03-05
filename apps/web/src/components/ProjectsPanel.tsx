import type { ProjectListItem } from "@dimensions/contracts";

interface ProjectsPanelProps {
  projects: ProjectListItem[];
}

export function ProjectsPanel({ projects }: ProjectsPanelProps) {
  return (
    <div className="panel projects-panel">
      <div className="panel-header">
        <h3>Projects</h3>
      </div>
      {projects.length === 0 ? (
        <p className="panel-hint">No projects yet. Create your first site to begin.</p>
      ) : (
        <ul className="project-list">
          {projects.map((project) => (
            <li key={project.id}>
              <div>
                <strong>{project.name}</strong>
                <small>{project.city_code}</small>
              </div>
              <div>
                <span>{project.variant_count} variants</span>
                <small>{project.context_ready ? "Context ready" : "Ingesting..."}</small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

