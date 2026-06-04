const FILTER_WIDTHS = ["w-[220px]", "w-[220px]", "w-[260px]", "w-[112px]"];

const HEADERS = [
  "CREATED",
  "TYPE",
  "INITIATOR",
  "FROM",
  "TO",
  "AMOUNT",
  "STATUS",
  "",
];

const SKELETON_ROWS = Array.from({ length: 10 }, (_, index) => index);

export default function UtilaHistoryLoading() {
  return (
    <main className="ml-[230px] h-[calc(100vh-64px)] w-[calc(100vw-230px)] overflow-hidden bg-white px-6 py-5 text-[#3f4361]">
      <div className="flex h-full min-h-0 w-full flex-col gap-4">
        <div className="shrink-0 flex flex-wrap items-center gap-2">
          {FILTER_WIDTHS.map((width, index) => (
            <div
              className={`${width} h-8 rounded-[7px] border border-[#dfe2ec] bg-[#fbfbfd]`}
              key={index}
            />
          ))}
          <div className="ml-auto h-8 w-[116px] rounded-[7px] border border-[#dfe2ec] bg-white" />
        </div>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[7px] border border-[#e3e5eb] bg-white shadow-[0_2px_8px_rgba(42,47,74,0.08)]">
          <div className="flex h-[64px] shrink-0 items-center justify-between border-b border-[#eef0f4] px-6">
            <div className="h-5 w-[140px] rounded bg-[#eef0f4]" />
            <div className="size-8 rounded-[7px] bg-[#f4f5ff]" />
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <table className="min-w-[1320px] w-full border-collapse text-left">
              <thead>
                <tr className="h-[49px] border-b border-[#eceef3] bg-white">
                  {HEADERS.map((header) => (
                    <th
                      className="px-3 text-[12px] font-bold uppercase text-[#2f344e] first:px-6"
                      key={header || "actions"}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SKELETON_ROWS.map((row) => (
                  <tr
                    className="h-[70px] border-b border-[#eceef3] last:border-b-0"
                    key={row}
                  >
                    {HEADERS.map((header, cellIndex) => (
                      <td className="px-3 first:px-6" key={`${row}-${header}`}>
                        {cellIndex === HEADERS.length - 1 ? (
                          <div className="ml-auto h-5 w-1 rounded bg-[#eef0f4]" />
                        ) : (
                          <div
                            className="h-4 rounded bg-[#eef0f4]"
                            style={{
                              width:
                                cellIndex === 0
                                  ? 150
                                  : cellIndex === 1
                                    ? 110
                                    : cellIndex === 6
                                      ? 82
                                      : 180,
                            }}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex h-12 shrink-0 items-center justify-end gap-8 border-t border-[#eef0f4] px-6">
            <div className="h-4 w-[88px] rounded bg-[#eef0f4]" />
            <div className="h-4 w-[78px] rounded bg-[#eef0f4]" />
          </div>
        </section>
      </div>
    </main>
  );
}
