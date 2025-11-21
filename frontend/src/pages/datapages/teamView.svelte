<script>
  import { createGrid, ModuleRegistry, AllCommunityModule } from "ag-grid-community";
  import { onMount, onDestroy } from "svelte";

  ModuleRegistry.registerModules([ AllCommunityModule ]);


  const apiData = {
    columns: ["rowLabel", "Column 1", "Column 2", "Column 3"],
    rows: [
      { rowLabel: "Metric 1", "Column 1": 1, "Column 2": 3, "Column 3": 5 },
      { rowLabel: "Metric 2", "Column 1": 0, "Column 2": 2, "Column 3": 4 },
      { rowLabel: "Metric 3", "Column 1": 6, "Column 2": 1, "Column 3": 7 },
    ]
  };

  let columnDefs = $state([]);
  let rowData = $state([]);

  let domNode;
  let grid;

  $effect(() => {
    if (!apiData?.columns || !apiData?.rows) return;

    columnDefs = apiData.columns.map(col => {
      if (col === "rowLabel") {
        return {
          headerName: "",
          field: "rowLabel",
          pinned: "left",
          cellStyle: {
            fontWeight: "bold",
            background: "#8e2d2d",
            color: "white"
          }
        };
      }
      return {
        headerName: col,
        field: col,
        cellStyle: params => ({
          background: getColor(params.value),
          color: "white",
          textAlign: "center",
          fontWeight: "600"
        })
      };
    });

    rowData = apiData.rows;
  });

  onMount(() => {
    console.log(columnDefs);
      grid = createGrid(domNode, {rowData, columnDefs});
  });

  function getColor(value) {
    if (value === 0) return "#000";
    if (value <= 2) return "#FF4D4D";
    if (value <= 4) return "#FFCC33";
    if (value <= 6) return "#66CC66";
    return "#4D7CFF";
  }

  let gridApi;

</script>

<div bind:this={domNode} style="margin: 0; height: 720px; width: 1000px;">
</div>