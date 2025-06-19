// static/js/dashboard.js
document.addEventListener('DOMContentLoaded', function() {
    const ctx = document.getElementById('statsChart').getContext('2d');
    const apiUrl = '/dashboard/api/chart-data/';

    const recipesBtn = document.getElementById('show-recipes-btn');
    const slidesBtn = document.getElementById('show-slides-btn');
    const breadcrumbsEl = document.getElementById('chart-breadcrumbs');

    let myChart;
    let chartState = {
        model: 'recipe', // Modèle initial
        drilldownStack: []
    };

    // --- ENHANCED CHART DESIGN ---
    const chartColors = {
        primary: '#123456', // Bleu foncé de base.css
        secondary: '#45b7d1', // Bleu clair/turquoise de creator.css
        gridLines: 'rgba(0, 0, 0, 0.08)',
        tooltipBg: '#050350', // Bleu très foncé de styles.css
        font: '#343a40'
    };
    
    const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    gradient.addColorStop(0, chartColors.secondary);
    gradient.addColorStop(1, chartColors.primary);

    const chartConfig = {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Count',
                data: [],
                backgroundColor: gradient,
                borderColor: chartColors.primary,
                borderWidth: 1,
                borderRadius: 4,
                hoverBackgroundColor: chartColors.secondary,
                hoverBorderColor: chartColors.primary, // Bordure plus visible au survol
                hoverBorderWidth: 2,
                ids: []
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            animation: { // Animation plus douce
                duration: 800,
                easing: 'easeInOutQuart',
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { precision: 0, color: chartColors.font },
                    grid: { color: chartColors.gridLines, drawOnChartArea: true }
                },
                y: {
                    ticks: { color: chartColors.font },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: '',
                    font: { size: 18, family: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
                    color: chartColors.font
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: chartColors.tooltipBg,
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 12 },
                    padding: 10,
                    cornerRadius: 5,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return `Total : ${context.parsed.x}`;
                        }
                    }
                }
            },
            onClick: handleChartClick
        }
    };

    async function updateChart() {
        const currentLevel = chartState.drilldownStack[chartState.drilldownStack.length - 1];
        if (!currentLevel) return;

        const params = new URLSearchParams({ model: chartState.model, ...currentLevel.apiParams });

        try {
            const response = await fetch(`${apiUrl}?${params.toString()}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch chart data');
            }
            const result = await response.json();

            if (!myChart) {
                myChart = new Chart(ctx, chartConfig);
            }
            
            myChart.config.data.datasets[0].ids = result.ids;
            myChart.data.labels = result.labels;
            myChart.data.datasets[0].data = result.data;
            myChart.options.plugins.title.text = currentLevel.title;
            myChart.update();
            
            updateBreadcrumbs();
        } catch (error) {
            console.error(error);
            breadcrumbsEl.innerHTML = `<span class="text-danger">Erreur: ${error.message}</span>`;
        }
    }

    function handleChartClick(event) {
        const points = myChart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
        if (points.length === 0) return;

        const index = points[0].index;
        const clickedLabel = myChart.data.labels[index];
        const clickedId = myChart.config.data.datasets[0].ids[index];
        const currentLevel = chartState.drilldownStack[chartState.drilldownStack.length - 1];
        const modelName = chartState.model.charAt(0).toUpperCase() + chartState.model.slice(1);

        if (currentLevel.apiParams.group_by === 'subject') {
            chartState.drilldownStack.push({
                label: clickedId,
                title: `${modelName}s in ${clickedId} by Topic`,
                apiParams: { group_by: 'topic', subject_name: clickedId }
            });
            updateChart();
        } else if (currentLevel.apiParams.group_by === 'topic') {
            const shortLabel = clickedLabel.split(' ').slice(1).join(' ');
            chartState.drilldownStack.push({
                label: shortLabel.length > 20 ? shortLabel.substring(0, 20) + '...' : shortLabel,
                title: `Sub-topics for ${shortLabel}`,
                apiParams: { ...currentLevel.apiParams, topic_id: clickedId }
            });
            updateChart();
        }
    }

    function resetToTopLevel() {
        const modelName = chartState.model.charAt(0).toUpperCase() + chartState.model.slice(1);
        chartState.drilldownStack = [{
            label: 'Subjects',
            title: `Count of ${modelName}s by Subject`,
            apiParams: { group_by: 'subject' }
        }];
        updateChart();
    }

    function updateBreadcrumbs() {
        breadcrumbsEl.innerHTML = '';
        chartState.drilldownStack.forEach((level, index) => {
            const isLast = index === chartState.drilldownStack.length - 1;
            const breadcrumb = document.createElement(isLast ? 'span' : 'a');
            breadcrumb.href = '#';
            breadcrumb.className = isLast ? 'fw-bold text-dark' : 'text-primary';
            breadcrumb.textContent = level.label;

            if (!isLast) {
                breadcrumb.addEventListener('click', (e) => {
                    e.preventDefault();
                    chartState.drilldownStack = chartState.drilldownStack.slice(0, index + 1);
                    updateChart();
                });
            }

            breadcrumbsEl.appendChild(breadcrumb);
            if (!isLast) {
                 const separator = document.createElement('span');
                 separator.className = 'mx-2';
                 separator.textContent = '>';
                 breadcrumbsEl.appendChild(separator);
            }
        });
    }
    
  
    function setActiveModel(model) {
        if (chartState.model === model && myChart) return;
        
        chartState.model = model;

        if (model === 'recipe') {
            // Activer le bouton Recipes
            recipesBtn.classList.add('btn-primary', 'active');
            recipesBtn.classList.remove('btn-outline-primary');
            
            // Désactiver le bouton Slideshows
            slidesBtn.classList.add('btn-outline-primary');
            slidesBtn.classList.remove('btn-primary', 'active');
        } else { // model === 'slide'
            // Activer le bouton Slideshows
            slidesBtn.classList.add('btn-primary', 'active');
            slidesBtn.classList.remove('btn-outline-primary');

            // Désactiver le bouton Recipes
            recipesBtn.classList.add('btn-outline-primary');
            recipesBtn.classList.remove('btn-primary', 'active');
        }
        
        resetToTopLevel();
    }

    recipesBtn.addEventListener('click', () => setActiveModel('recipe'));
    slidesBtn.addEventListener('click', () => setActiveModel('slide'));

    // --- Initial Load ---
    setActiveModel('recipe');
});
