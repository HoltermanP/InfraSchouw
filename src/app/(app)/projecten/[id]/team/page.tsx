import { PageBody } from "@/components/layout/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProjectTeamControls, RemoveMemberButton } from "@/components/projects/project-team";
import { listOrgMembers, listProjectMembers } from "@/db/queries/projects";
import { requireSession } from "@/lib/auth/session";
import { ROLE_LABELS, roleAtLeast } from "@/lib/domain";

export const metadata = { title: "Projectteam" };

export default async function ProjectTeamPage(props: PageProps<"/projecten/[id]/team">) {
  const { id } = await props.params;
  const session = await requireSession();
  const [members, orgMembers] = await Promise.all([listProjectMembers(session.ctx, id), listOrgMembers(session.ctx)]);
  const canEdit = roleAtLeast(session.role, "projectleider");
  const available = orgMembers.filter((m) => !members.some((pm) => pm.user.id === m.user.id));
  return (
    <PageBody>
      {canEdit ? <ProjectTeamControls projectId={id} candidates={available.map((m) => ({ id: m.user.id, name: m.user.name }))} /> : null}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Naam</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Rol in project</TableHead>
              <TableHead>Rol in organisatie</TableHead>
              {canEdit ? <TableHead className="w-12" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nog geen teamleden.
                </TableCell>
              </TableRow>
            ) : (
              members.map((m) => (
                <TableRow key={m.member.id}>
                  <TableCell className="font-medium">{m.user.name}</TableCell>
                  <TableCell>{m.user.email}</TableCell>
                  <TableCell className="capitalize">{m.member.projectRole}</TableCell>
                  <TableCell>{m.orgRole ? ROLE_LABELS[m.orgRole] : "—"}</TableCell>
                  {canEdit ? (
                    <TableCell>
                      <RemoveMemberButton projectId={id} userId={m.user.id} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </PageBody>
  );
}
