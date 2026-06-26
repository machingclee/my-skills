package com.example.config.datasource;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.datasource.LazyConnectionDataSourceProxy;

import com.zaxxer.hikari.HikariDataSource;

import javax.sql.DataSource;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Builds the write and read HikariCP pools, feeds them into a RoutingDataSource,
 * and exposes a LazyConnectionDataSourceProxy over it as the @Primary DataSource.
 */
@Configuration
@EnableConfigurationProperties(DataSourceProperties.class)
public class DataSourceConfiguration {

    private final DataSourceProperties properties;

    public DataSourceConfiguration(DataSourceProperties properties) {
        this.properties = properties;
    }

    @Bean
    public DataSource writeDataSource() {
        return buildPool(properties.getWrite(), "app-write");
    }

    @Bean
    public DataSource readDataSource() {
        return buildPool(properties.getRead(), "app-read");
    }

    @Bean
    public RoutingDataSource routingDataSource() {
        return new RoutingDataSource(
                Map.of(
                        RoutingDataSource.WRITE_KEY, writeDataSource(),
                        RoutingDataSource.READ_KEY, readDataSource()
                ),
                writeDataSource(),
                Map.of(
                        RoutingDataSource.WRITE_KEY, String.join(", ", properties.getWrite().getUrls()),
                        RoutingDataSource.READ_KEY, String.join(", ", properties.getRead().getUrls())
                )
        );
    }

    /**
     * The @Primary bean. This is the lazy proxy, NOT the write pool.
     * The write pool is only the routing datasource's default target.
     */
    @Bean
    @Primary
    public DataSource dataSource() {
        return new LazyConnectionDataSourceProxy(routingDataSource());
    }

    private DataSource buildPool(DataSourceProperties.Pool props, String poolNamePrefix) {
        List<DataSource> pools = new ArrayList<>();
        List<String> urls = props.getUrls();
        for (int i = 0; i < urls.size(); i++) {
            String poolName = urls.size() == 1 ? poolNamePrefix : poolNamePrefix + "-" + i;

            HikariDataSource hikari = DataSourceBuilder.create()
                    .type(HikariDataSource.class)
                    .url(urls.get(i))
                    .username(props.getUsername())
                    .password(props.getPassword())
                    .driverClassName(props.getDriverClassName())
                    .build();
            hikari.setMaximumPoolSize(props.getMaximumPoolSize());
            hikari.setMinimumIdle(props.getMinimumIdle());
            hikari.setConnectionTimeout(props.getConnectionTimeout());
            hikari.setIdleTimeout(props.getIdleTimeout());
            hikari.setPoolName(poolName);

            // If the project has a monitoring DataSource wrapper, wrap hikari here.
            pools.add(hikari);
        }
        return pools.size() == 1 ? pools.get(0) : new LoadBalancedDataSource(pools);
    }
}
