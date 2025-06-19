// static/js/statistics.js
document.addEventListener('DOMContentLoaded', function() {
    const ctx = document.getElementById('statsChart').getContext('2d');
    const apiUrl = '/statistics/api/chart-data/'; 

    const recipesBtn = document.getElementById('show-recipes-btn');
    const slidesBtn = document.getElementById('show-slides-btn');
    const breadcrumbsEl = document.getElementById('chart-breadcrumbs');

    let myChart;
    let chartState = {
        model: 'recipe',
        // The drilldownStack keeps track of our path, e.g., [Subjects -> Topics for 'Maths AA']
        drilldownStack: [] 
    };

    const chartConfig = {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: '',
                data: [],
                backgroundColor: 'rgba(0, 123, 255, 0.6)',
                borderColor: 'rgba(0, 123, 255, 1)',
                borderWidth: 1,
                // Custom property to store database IDs for each bar
                ids: [] 
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Makes it a horizontal bar chart, better for long labels
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0 // Ensure whole numbers for counts
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: '', // Title will be set dynamically
                    font: {
                        size: 18
                    }
                }
            },
            // This function is called when a user clicks on the chart
            onClick: handleChartClick 
        }
    };

    /**
     * Fetches data from the API and updates the chart.
     */
    async function updateChart() {
        const currentLevel = chartState.drilldownStack[chartState.drilldownStack.length - 1];
        if (!currentLevel) return;

        const params = new URLSearchParams({
            model: chartState.model,
            group_by: currentLevel.groupBy
        });

        if (currentLevel.filter) {
            params.append(currentLevel.filter.key, currentLevel.filter.value);
        }
        
        try {
            const response = await fetch(`${apiUrl}?${params.toString()}`);
            if (!response.ok) throw new Error('Failed to fetch chart data');
            const result = await response.json();

            // Update chart data
            myChart.config.data.datasets[0].ids = result.ids;
            myChart.data.labels = result.labels;
            myChart.data.datasets[0].data = result.data;
            myChart.options.plugins.title.text = `Count of ${chartState.model}s by ${currentLevel.label}`;
            myChart.update();
            
            updateBreadcrumbs();

        } catch (error) {
            console.error(error);
            breadcrumbsEl.innerHTML = '<span class="text-danger">Error loading data.</span>';
        }
    }

    /**
     * Handles clicks on chart bars to "drill down" to the next level.
     */
    function handleChartClick(event) {
        const points = myChart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
        if (points.length === 0) return;

        const index = points[0].index;
        const clickedLabel = myChart.data.labels[index];
        const clickedId = myChart.config.data.datasets[0].ids[index];
        const currentLevel = chartState.drilldownStack[chartState.drilldownStack.length - 1];

        // Determine the next level of drill-down
        if (currentLevel.groupBy === 'subject') {
            chartState.drilldownStack.push({
                label: 'Topics',
                groupBy: 'topic',
                filter: { key: 'subject_id', value: clickedId },
                parentLabel: clickedLabel // To show context in breadcrumbs
            });
            updateChart();
        }
        // Future drill-down levels can be added here (e.g., from topic to author)
    }

    /**
     * Resets the view to the top level for the current model.
     * @param {string} groupBy - The initial grouping ('subject' or 'author').
     * @param {string} label - The display label for this level.
     */
    function resetToTopLevel(groupBy, label) {
        chartState.drilldownStack = [{ label: label, groupBy: groupBy }];
        if (myChart) {
            updateChart();
        } else {
            // If chart doesn't exist, create it
            myChart = new Chart(ctx, chartConfig);
            updateChart();
        }
    }

    /**
     * Updates the breadcrumb navigation at the top of the chart.
     */
    function updateBreadcrumbs() {
        breadcrumbsEl.innerHTML = '';
        chartState.drilldownStack.forEach((level, index) => {
            const isLast = index === chartState.drilldownStack.length - 1;
            const breadcrumb = document.createElement(isLast ? 'span' : 'a');
            breadcrumb.href = '#';
            breadcrumb.className = isLast ? 'fw-bold text-dark' : 'text-primary';
            
            // Build the text for the breadcrumb
            let text = level.parentLabel ? `${level.parentLabel} > ${level.label}` : level.label;
            breadcrumb.textContent = text;

            if (!isLast) {
                breadcrumb.addEventListener('click', (e) => {
                    e.preventDefault();
                    // Go back to the clicked level by slicing the stack
                    chartState.drilldownStack = chartState.drilldownStack.slice(0, index + 1);
                    updateChart();
                });
            }

            breadcrumbsEl.appendChild(breadcrumb);

            if (!isLast) {
                breadcrumbsEl.append(' / ');
            }
        });
    }

    // --- Event Listeners for Buttons ---
    recipesBtn.addEventListener('click', () => {
        if (chartState.model === 'recipe') return; // Do nothing if already active
        chartState.model = 'recipe';
        recipesBtn.classList.add('active', 'btn-primary');
        recipesBtn.classList.remove('btn-outline-primary');
        slidesBtn.classList.remove('active', 'btn-primary');
        slidesBtn.classList.add('btn-outline-primary');
        resetToTopLevel('subject', 'Subjects');
    });

    slidesBtn.addEventListener('click', () => {
        if (chartState.model === 'slideshow') return; // Do nothing if already active
        chartState.model = 'slideshow';
        slidesBtn.classList.add('active', 'btn-primary');
        slidesBtn.classList.remove('btn-outline-primary');
        recipesBtn.classList.remove('active', 'btn-primary');
        recipesBtn.classList.add('btn-outline-primary');
        resetToTopLevel('subject', 'Subjects');
    });

    // --- Initial Load ---
    resetToTopLevel('subject', 'Subjects');
});
