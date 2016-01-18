module.exports = function() {
  $(initSearchInterface);

  function initSearchInterface() {
    var parse = require("querystring").parse;
    var algoliasearch = require("algoliasearch");
    var lodash = require("lodash");

    var client = algoliasearch("EPS14HJ7KB", "0fd7a79cd6abdf308ded148553390351");
    var index = client.initIndex("npmjs-registry");
    var initialParams = parse(location.search.slice(1));

    var $form = $("npm-search");
    var $input = $("#site-search");
    var $content = $("<div>").appendTo(".container.content");
    var $previousContent = $content.siblings();
    var template = require("../templates/search.hbs");
    var firstRender = true;
    var query = initialParams.q || "";
    var currentPage = initialParams.page || 1;
    var hitsPerPage = 20;
    var previousQuery;
    var fromPopState = false;
    var debouncedSyncURL = lodash.debounce(syncURL, 300, {
      leading: false,
      trailing: true
    });
    var immediateURLSync = false;

    $form.on("submit", onSubmit);
    $input.on("input propertychange", newQuery);
    $content.on("click", ".pagination .previous", changePage(-1));
    $content.on("click", ".pagination .next", changePage(1));
    $(window).on("popstate", onPopState);
    history.replaceState({q: query, page: currentPage}, null);

    if (query !== "") {
      $input.val(query);
      newQuery();
    }

    function newQuery() {
      query = $input.val();

      if (previousQuery === query) { // maybe a modifier key pressed, ignore
        return;
      }

      search();
    }

    function search() {
      if (query === "") {
        previousQuery = query;
        $previousContent.show();
        $content.hide();
        syncURL();
        return;
      }

      index
        .search(query, {
          page: currentPage - 1, // Algolia starts at page 0
          hitsPerPage: hitsPerPage
        })
        .then(discardOrRender)
        .catch(err);
    }

    // if query t-1 is slower than query t: old results would override new results
    function discardOrRender(content) {
      if (content.query !== query) {
        // discard this response
        return;
      }

      var specificURLSync;
      if (immediateURLSync) {
        specificURLSync = syncURL;
        immediateURLSync = false;
      } else {
        specificURLSync = debouncedSyncURL;
      }

      previousQuery = query;

      return Promise
        .resolve(content)
        .then(prepareData)
        .then(render)
        .then(specificURLSync);
    }

    function render(data) {
      $previousContent.hide();
      $content.show();
      $content.html(template(data));
    }

    function changePage(diff) {
      return function(e) {
        e.preventDefault();
        currentPage += diff;
        immediateURLSync = true;
        search();
        $input[0].scrollIntoView({block: "start", behavior: "smooth"});
      }
    }

    function syncURL() {
      if (fromPopState) {
        fromPopState = false;
        return;
      }
      var format = require("util").format;
      var url;
      if (query === "") {
        url = "/";
      } else {
        url = format("/search?q=%s&page=%d", query, currentPage);
      }

      history.pushState({
        q: query,
        page: currentPage
      }, null, url);
    }

    function onPopState(e) {
      query = e.originalEvent.state.q;
      currentPage = e.originalEvent.state.page;
      $input.val(query);
      $input.focus();
      fromPopState = true;
      search();
    }

    function onSubmit(e) {
      e.preventDefault();
    }

    function prepareData(content) {
      var pages = {};
      currentPage = content.page + 1;
      if (content.page > 0) {
        pages.prev = currentPage - 1;
      }

      if (content.page < content.nbPages - 1) {
        pages.next = currentPage + 1;
      }

      return {
        totalResults: content.nbHits,
        singleResult: content.nbHits === 1,
        page: currentPage,
        pages: pages,
        q: content.query,
        results: content.hits.map(prepareHit)
      }
    }

    function prepareHit(hit) {
      return {
        fields: {
          name: hit.name,
          author: hit.author.name,
          description: hit.description,
          version: hit.version,
          keywords: hit.keywords
        }
      };
    }

    function err(reason) {
      render({error: true});
      console.error(reason);
    }
  }
}
