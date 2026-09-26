import Link from "next/link";
import { PageBody } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TemplateListActions } from "@/components/settings/template-list-actions";
import { getTemplatesFull } from "@/db/queries/templates";
import { requireSession } from "@/lib/auth/session";
import { TEMPLATE_PHASE_LABELS } from "@/lib/domain";

export const metadata = { title: "Schouwtemplates" };

export default async function TemplatesPage() {
  const session = await requireSession("admin");
  const templates = await getTemplatesFull(session.ctx);
  return (
    <PageBody>
      <TemplateListActions />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Naam</TableHead>
              <TableHead>Fase</TableHead>
              <TableHead className="text-right">Checklist</TableHead>
              <TableHead className="text-right">Shots</TableHead>
              <TableHead className="text-right">Secties</TableHead>
              <TableHead>Kenmerken</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <Link href={`/instellingen/templates/${t.id}`} className="font-medium hover:underline">
                    {t.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </TableCell>
                <TableCell>{TEMPLATE_PHASE_LABELS[t.phase]}</TableCell>
                <TableCell className="text-right">{t.checklist.length}</TableCell>
                <TableCell className="text-right">{t.shots.length}</TableCell>
                <TableCell className="text-right">{t.sections.length}</TableCell>
                <TableCell className="space-x-1">
                  {t.isStation ? <Badge variant="outline">Station</Badge> : null}
                  {t.isBilling ? <Badge variant="outline">Afrekening</Badge> : null}
                </TableCell>
                <TableCell>{t.active ? <Badge>Actief</Badge> : <Badge variant="secondary">Inactief</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </PageBody>
  );
}
