export interface TableColumn {
  key: string;
  label: string;
  format?: (value: unknown) => string;
}

export interface TableSpec {
  columns: TableColumn[];
  rows: Record<string, unknown>[];
}

function cell(col: TableColumn, row: Record<string, unknown>): string {
  const value = row[col.key];
  if (value === null || value === undefined) return "—";
  return col.format ? col.format(value) : String(value);
}

/** The accessible twin of every chart — same rows, plain HTML, no color. */
export function DataTable({ spec }: { spec: TableSpec }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {spec.columns.map((col) => (
              <th key={col.key} scope="col">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.rows.map((row, i) => (
            <tr key={i}>
              {spec.columns.map((col) => (
                <td key={col.key}>{cell(col, row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
