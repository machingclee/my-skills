package com.example.config.datasource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.datasource.lookup.AbstractRoutingDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Map;

/**
 * Routes connections to the read pool when the current transaction is read-only,
 * and to the write pool otherwise. Spring calls determineCurrentLookupKey() at
 * the moment a connection is acquired.
 *
 * This MUST sit behind a LazyConnectionDataSourceProxy so the lookup happens
 * after the transaction's read-only flag is set. See DataSourceConfiguration.
 */
public class RoutingDataSource extends AbstractRoutingDataSource {

    private static final Logger log = LoggerFactory.getLogger(RoutingDataSource.class);

    public static final String WRITE_KEY = "write";
    public static final String READ_KEY = "read";

    private final Map<Object, String> dataSourceUrls;

    public RoutingDataSource(Map<Object, Object> targetDataSources,
                             Object defaultTargetDataSource,
                             Map<Object, String> dataSourceUrls) {
        setTargetDataSources(targetDataSources);
        setDefaultTargetDataSource(defaultTargetDataSource);
        afterPropertiesSet();
        this.dataSourceUrls = dataSourceUrls;
    }

    @Override
    protected Object determineCurrentLookupKey() {
        boolean readOnly = TransactionSynchronizationManager.isCurrentTransactionReadOnly();
        String key = readOnly ? READ_KEY : WRITE_KEY;
        log.info("Routing connection (readOnly={}) to [{}] datasource: {}",
                readOnly, key, dataSourceUrls.getOrDefault(key, "?"));
        return key;
    }
}
