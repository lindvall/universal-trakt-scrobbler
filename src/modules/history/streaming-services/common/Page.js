import { Box, CircularProgress } from '@material-ui/core';
import React, { useEffect, useState } from 'react';
import { UtsCenter } from '../../../../components/UtsCenter';
import { BrowserStorage } from '../../../../services/BrowserStorage';
import { Events, EventDispatcher } from '../../../../services/Events';
import { HistoryActions } from '../../components/history/HistoryActions';
import { HistoryList } from '../../components/history/HistoryList';
import { HistoryOptionsList } from '../../components/history/HistoryOptionsList';
import { TraktSync } from '../../../../api/TraktSync';

export const Page = ({serviceName, store, api}) => {
  const [optionsContent, setOptionsContent] = useState({
    hasLoaded: false,
    options: {},
  });
  const [content, setContent] = useState({
    isLoading: true,
    isLastPage: false,
    nextPage: 0,
    nextVisualPage: 0,
    items: [],
  });

  const loadNextPage = () => {
    const itemsToLoad = (content.nextVisualPage + 1) * optionsContent.options.itemsPerLoad.value - content.items.length;
    if (itemsToLoad > 0) {
      setContent(prevContent => ({
        ...prevContent,
        isLoading: true,
      }));
      api.loadHistory(content.nextPage, content.nextVisualPage, itemsToLoad);
    } else {
      store.update({
        nextVisualPage: content.nextVisualPage + 1,
      });
    }
  };

  const onNextPageClick = () => {
    loadNextPage();
  };

  const onSyncClick = async () => {
    setContent(prevContent => ({
      ...prevContent,
      isLoading: true,
    }));
    await TraktSync.sync(store.data.items, optionsContent.options.addWithReleaseDate.value);
    setContent(prevContent => ({
      ...prevContent,
      isLoading: false,
    }));
  };

  useEffect(() => {
    function startListeners() {
      EventDispatcher.subscribe(Events.STREAMING_SERVICE_STORE_UPDATE, onStoreUpdate);
      EventDispatcher.subscribe(Events.STREAMING_SERVICE_HISTORY_LOAD_ERROR, onHistoryLoadError);
      EventDispatcher.subscribe(Events.TRAKT_HISTORY_LOAD_ERROR, onTraktHistoryLoadError);
      EventDispatcher.subscribe(Events.HISTORY_SYNC_SUCCESS, onHistorySyncSuccess);
      EventDispatcher.subscribe(Events.HISTORY_SYNC_ERROR, onHistorySyncError);
      store.startListeners();
    }

    const stopListeners = () => {
      EventDispatcher.unsubscribe(Events.STREAMING_SERVICE_STORE_UPDATE, onStoreUpdate);
      EventDispatcher.unsubscribe(Events.STREAMING_SERVICE_HISTORY_LOAD_ERROR, onHistoryLoadError);
      EventDispatcher.unsubscribe(Events.TRAKT_HISTORY_LOAD_ERROR, onTraktHistoryLoadError);
      EventDispatcher.unsubscribe(Events.HISTORY_SYNC_SUCCESS, onHistorySyncSuccess);
      EventDispatcher.unsubscribe(Events.HISTORY_SYNC_ERROR, onHistorySyncError);
      store.stopListeners();
    };

    /**
     * @param {Object} data
     */
    function onStoreUpdate(data) {
      setContent({
        isLoading: false,
        ...data.data,
      });
    }

    /**
     * @returns {Promise}
     */
    async function onHistoryLoadError() {
      await EventDispatcher.dispatch(Events.SNACKBAR_SHOW, {
        messageName: 'loadHistoryError',
        severity: 'error',
      });
    }

    /**
     * @returns {Promise}
     */
    async function onTraktHistoryLoadError() {
      await EventDispatcher.dispatch(Events.SNACKBAR_SHOW, {
        messageName: 'loadTraktHistoryError',
        severity: 'error',
      });
    }

    /**
     * @param {Object} data
     * @returns {Promise}
     */
    async function onHistorySyncSuccess(data) {
      await EventDispatcher.dispatch(Events.SNACKBAR_SHOW, {
        messageArgs: [data.added.episodes.toString(), data.added.movies.toString()],
        messageName: 'historySyncSuccess',
        severity: 'success',
      });
    }

    /**
     * @returns {Promise}
     */
    async function onHistorySyncError() {
      await EventDispatcher.dispatch(Events.SNACKBAR_SHOW, {
        messageName: 'historySyncError',
        severity: 'error',
      });
    }

    startListeners();
    return stopListeners;
  }, []);

  useEffect(() => {
    function startListeners() {
      EventDispatcher.subscribe(Events.HISTORY_OPTIONS_CHANGE, onOptionsChange);
    }

    function stopListeners() {
      EventDispatcher.unsubscribe(Events.HISTORY_OPTIONS_CHANGE, onOptionsChange);
    }

    /**
     * @param {Object} data
     */
    function onOptionsChange(data) {
      const optionsToSave = {};
      const options = {
        ...optionsContent.options,
        [data.id]: {
          ...optionsContent.options[data.id],
          value: data.value,
        },
      };
      for (const option of Object.values(options)) {
        optionsToSave[option.id] = option.value;
      }
      BrowserStorage.set({ syncOptions: optionsToSave }, true)
        .then(async () => {
          setOptionsContent({
            hasLoaded: true,
            options,
          });
          await EventDispatcher.dispatch(Events.SNACKBAR_SHOW, {
            messageName: 'saveOptionSuccess',
            severity: 'success',
          });
        })
        .catch(async err => {
          Errors.error('Failed to save option.', err);
          await EventDispatcher.dispatch(Events.SNACKBAR_SHOW, {
            messageName: 'saveOptionFailed',
            severity: 'error',
          });
        });
    }

    startListeners();
    return stopListeners;
  }, [optionsContent.options]);

  useEffect(() => {
    async function getOptions() {
      setOptionsContent({
        hasLoaded: true,
        options: await BrowserStorage.getSyncOptions(),
      });
    }

    getOptions();
  }, []);

  useEffect(() => {
    function loadFirstPage() {
      if (optionsContent.hasLoaded) {
        loadNextPage();
      }
    }

    loadFirstPage();
  }, [optionsContent.hasLoaded]);

  let itemsToShow = [];
  if (optionsContent.hasLoaded && content.nextVisualPage > 0) {
    itemsToShow = content.items.slice((content.nextVisualPage - 1) * optionsContent.options.itemsPerLoad.value, content.nextVisualPage * optionsContent.options.itemsPerLoad.value);
    if (optionsContent.options.hideSynced.value) {
      itemsToShow = itemsToShow.filter(x => !x.trakt || !x.trakt.watchedAt);
    }
  }
  const dateFormat = optionsContent.hasLoaded && optionsContent.options.use24Clock.value ? 'MMMM Do YYYY, H:mm:ss' : 'MMMM Do YYYY, h:mm:ss a';

  return content.isLoading ? (
    <UtsCenter>
      <CircularProgress/>
    </UtsCenter>
  ) : (
    <>
      <Box className="history-content">
        <HistoryOptionsList options={Object.values(optionsContent.options)} store={store}/>
        <HistoryList
          dateFormat={dateFormat}
          items={itemsToShow}
          serviceName={serviceName}
        />
      </Box>
      <HistoryActions
        onNextPageClick={onNextPageClick}
        onSyncClick={onSyncClick}
      />
    </>
  );
}
