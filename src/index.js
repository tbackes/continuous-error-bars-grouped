const d3 = require('d3');
const plotly = require('plotly.js-dist');
const dscc = require('@google/dscc');
const local = require('./localMessage.js');

// change this to 'true' for local development
// change this to 'false' before deploying
export const LOCAL = false;

const isNull = (x) => {
  return !(x===0) && (x == null || x == "null" || x == "");
}

const isNumeric = (x) => {
  return !isNull(x) && !isNaN(x);
}

// parse the style value
const styleVal = (message, styleId) => {
  if (!!message.style[styleId].defaultValue && typeof message.style[styleId].defaultValue === "object") {
    return message.style[styleId].value.color !== undefined
      ? message.style[styleId].value.color
      : message.style[styleId].defaultValue.color;
  }
  return message.style[styleId].value !== undefined
    ? message.style[styleId].value
    : message.style[styleId].defaultValue;
};

// parse a style color -- defaulting to the theme color if applicable
const themeColor = (message, styleId, themeId='themeSeriesColor', idx=null) => {
  // if a user specifed value is present, keep that
  if (message.style[styleId].value.color !== undefined) {
    return message.style[styleId].value.color;
  }
  // otherwise use the theme color
  return isNumeric(idx)
    ? message.theme[themeId][idx].color
    : message.theme[themeId].color;
};

// parse a style value -- defaulting to the theme value if applicable
const themeValue = (message, styleId, themeId='themeFontFamily') => {
  return message.style[styleId].value !== undefined
    ? message.style[styleId].value
    : message.theme[themeId];
};

const hex_to_rgba_str = (hex_color, opacity) => {
  var hex_strip = hex_color.replace(new RegExp("^#"),"");
  hex_strip = (hex_strip.length==3)? hex_strip+hex_strip : hex_strip;
  var rgba = 'rgba(' 
    + parseInt(hex_strip.substring(0,2), 16) + ',' 
    + parseInt(hex_strip.substring(2,4), 16) + ',' 
    + parseInt(hex_strip.substring(4,6), 16) + ','
    + opacity + ')';
  return rgba
}

const toDate = (dateString) => {
  let year = dateString.substring(0,4)
  let month = dateString.substring(4,6)-1
  let day = dateString.substring(6,8)
  let hour = dateString.substring(8,10)
  let min = dateString.substring(10,12)
  let sec = dateString.substring(12,14)

  return new Date(year, month, day, hour, min, sec)
}

Date.prototype.addDays = function(days) {
    return new Date(this.valueOf()+(24*60*60*days))
}

const drawViz = message => {

  // set margins + canvas size
  const margin = { top: 10, bottom: 50, right: 10, left: 10 };
  const height = dscc.getHeight() - margin.top - margin.bottom;
  const width = dscc.getWidth() - margin.left - margin.right;

  // remove the div if it already exists
  if (document.querySelector("div")) {
    let oldDiv = document.querySelector("div");
    oldDiv.parentNode.removeChild(oldDiv);
  }

  // create div for plotly plot
  const myDiv = document.createElement('div');
  myDiv.setAttribute("height", `${dscc.getHeight()}px`);
  myDiv.setAttribute("width", `${dscc.getWidth()}px`);

  document.body.appendChild(myDiv);

  // write your visualization code here
  // console.log("I'm the callback and I was passed this data: " + JSON.stringify(message.style, null, '  '));
  // console.log("Theme data: " + JSON.stringify(message.theme, null, '  '));

  //gather plot-level style parameters
  const chartTitle = styleVal(message, 'chartTitle');
  const xAxisDate = styleVal(message, 'xAxisDate');
  const xLabel = styleVal(message, 'xLabel');
  const yAxisMin = styleVal(message, 'yMin');
  const yAxisMax = styleVal(message, 'yMax');
  const yLabel = styleVal(message, 'yLabel');
  const metricFmt = styleVal(message, 'metricFormatString');
  const ciFmt = styleVal(message, 'ciFormatString');

  // get unique breakdown groups
  const breakdown_values = [...new Set(message.tables.DEFAULT.map(d => d.dimension_breakdown[0]))];
  console.log('All groups: ' + breakdown_values)

  // Gather re-used data
  const customdata = message.tables.DEFAULT.map(d => [d.metric_lower[0], d.metric_upper[0]]); 
  const hovertemplate = `<b>%{y:${metricFmt}}</b><i> (%{customdata[0]:${ciFmt}} - %{customdata[1]:${ciFmt}})</i>`;

  const xData = xAxisDate
    ? message.tables.DEFAULT.map(d => toDate(d.dimension[0])) 
    : message.tables.DEFAULT.map(d => d.dimension[0]);

  // loop through breadown groups and add traces
  let data = []
  let i;
  for (i=0; i<breakdown_values.length; i++){
    // console.log('i: '+i)

    // Gather all style parameters
    // series properties
    const metricLineWeight =  styleVal(message, 'metricLineWeight'+(i+1));
    const metricLineColor =  themeColor(message, 'metricColor'+(i+1), 'themeSeriesColor', i);
    const metricFillColor =  hex_to_rgba_str(
      themeColor(message, 'metricFillColor'+(i+1), 'themeSeriesColor', i),
      styleVal(message, 'metricFillOpacity'+(i+1)));
    const metricShowPoints =  styleVal(message, 'metricShowPoints'+(i+1));
    const metricShowCI =  styleVal(message, 'metricShowCI'+(i+1));

    // trace for metric trend line
    const trace_metric = {
      x: xData,
      y: message.tables.DEFAULT.map(d => d.metric[0]),
      customdata,
      line: {
        color: metricLineColor,
        width: metricLineWeight
      }, 
      mode: (metricShowPoints)? 'lines+markers' : 'lines', 
      transforms: [{
      	type: 'filter',
      	target: message.tables.DEFAULT.map(d => d.dimension_breakdown[0]),
        operation: '=',
        value: breakdown_values[i]
      }],
      name: breakdown_values[i], 
      type: "lines",
      legendgroup: 'metric'+i, 
      hovertemplate
    };

    // trace for lower bound of CI
    const trace_lower = {
      x: xData,
      y: message.tables.DEFAULT.map(d => d.metric_lower[0]),
      line: {width: 1}, 
      marker: {color: metricFillColor}, 
      mode: "lines", 
      transforms: [{
        type: 'filter',
        target: message.tables.DEFAULT.map(d => d.dimension_breakdown[0]),
        operation: '=',
        value: breakdown_values[i]
      }],
      name: `${breakdown_values[i]}: ${message.fields.metric_lower[0].name}`, 
      type: "scatter",
      legendgroup: 'ci'+i,
      hoverinfo: 'skip', 
      visible: (metricShowCI)? true : 'legendonly',
      showlegend: false
    };

    // trace for upper bound of CI
    const trace_upper = {
      x: xData,
      y: message.tables.DEFAULT.map(d => d.metric_upper[0]),
      line: {width: 1}, 
      fill: "tonexty", 
      fillcolor: metricFillColor, 
      marker: {color: metricFillColor}, 
      line: {color: metricFillColor}, 
      mode: "lines", 
      transforms: [{
        type: 'filter',
        target: message.tables.DEFAULT.map(d => d.dimension_breakdown[0]),
        operation: '=',
        value: breakdown_values[i]
      }],
      name: `${breakdown_values[i]}: ${message.fields.metric_upper[0].name}`,
      type: "scatter",
      legendgroup: 'ci'+i,
      hoverinfo: 'skip', 
      visible: (metricShowCI)? true : 'legendonly',
      showlegend: true
    };

    data.push(trace_metric, trace_lower, trace_upper);
  }

  // format for y axis
  let yAxisRange = {};
  if (!isNumeric(yAxisMin) && !isNumeric(yAxisMax)){
    yAxisRange = {};
  }
  else if (!isNumeric(yAxisMin)){
    const minValue = Math.min.apply(Math, message.tables.DEFAULT.map(function(d) {return Math.min(...d.metric_lower)}));
    yAxisRange = {range: [Math.floor(0.9*minValue), yAxisMax]};
  }
  else if (!isNumeric(yAxisMax)){
    const maxValue = Math.max.apply(Math, message.tables.DEFAULT.map(function(d) {return Math.max(...d.metric_upper)}));
    yAxisRange = {range: [yAxisMin, Math.ceil(1.1*maxValue)]};
  }
  else {
    yAxisRange = {range: [yAxisMin, yAxisMax]};
  }

  // Chart Titles
  let chartTitleLayout = {};
  if (isNull(chartTitle)) {
    chartTitleLayout = {}
  }
  else {
    chartTitleLayout = {text: chartTitle}
  }

  let yAxisTitleLayout = {};
  if (isNull(yLabel)) {
    yAxisTitleLayout = {title: {}}
  }
  else {
    yAxisTitleLayout = {title: {text: yLabel}}
  }

  let xAxisTitleLayout = {};
  if (isNull(xLabel)) {
    xAxisTitleLayout = {title: {}}
  }
  else {
    xAxisTitleLayout = {title: {text: xLabel}}
  }

  const layout = {
    height: height+60,
    showlegend: true,
    yaxis: Object.assign({}, yAxisRange, yAxisTitleLayout, {tickformat: metricFmt}),
    xaxis: Object.assign({}, xAxisTitleLayout),
    title: chartTitleLayout,
    // legend: {
    //   orientation: 'h',
    //   yanchor: "bottom",
    //   y: 1.02,
    //   xanchor: "right",
    //   x: 1
    // }
  };

  plotly.newPlot(myDiv, data, layout);
};

// renders locally
if (LOCAL) {
  drawViz(local.message);
} else {
  dscc.subscribeToData(drawViz, {transform: dscc.objectTransform});
}