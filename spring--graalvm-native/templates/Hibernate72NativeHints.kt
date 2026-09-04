package com.example.config // rename to the app package

import org.springframework.aot.hint.MemberCategory
import org.springframework.aot.hint.RuntimeHints
import org.springframework.aot.hint.RuntimeHintsRegistrar
import org.springframework.aot.hint.TypeReference
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.ImportRuntimeHints

/**
 * Hibernate 7.2 JBoss `*_$logger` classes + Kotlin Parameter.getName().
 *
 * Do not paste a stale class list. Extract current names from the resolved
 * hibernate-core jar (`jar tf … | rg '_\$logger\.class$'`) and keep this list
 * in sync. See references/hibernate-72-native.md.
 *
 * Also merge the jar-extracted annotation wrappers and EventListener[] types
 * into reachability-metadata.json (too many to list here).
 */
class Hibernate72NativeHints : RuntimeHintsRegistrar {
    override fun registerHints(hints: RuntimeHints, classLoader: ClassLoader?) {
        LOGGERS.forEach { name ->
            hints.reflection().registerType(
                TypeReference.of(name),
                MemberCategory.INVOKE_DECLARED_CONSTRUCTORS,
                MemberCategory.INVOKE_PUBLIC_METHODS
            )
        }
        hints.resources().registerPattern("org/hibernate/**/*.i18n.properties")

        listOf(
            "java.lang.reflect.Parameter",
            "java.lang.reflect.Executable",
            "java.lang.reflect.Method",
            "java.lang.reflect.Constructor",
            "java.lang.reflect.Field",
        ).forEach { name ->
            hints.reflection().registerType(
                TypeReference.of(name),
                MemberCategory.INVOKE_DECLARED_METHODS,
                MemberCategory.INVOKE_PUBLIC_METHODS,
                MemberCategory.INVOKE_DECLARED_CONSTRUCTORS
            )
        }

        // Jackson kotlin module introspects emptyList()/emptySet() as these classes.
        listOf(
            "kotlin.collections.EmptyList",
            "kotlin.collections.EmptySet",
            "kotlin.collections.EmptyMap",
            "kotlin.collections.EmptyIterator",
        ).forEach { name ->
            hints.reflection().registerType(
                TypeReference.of(name),
                MemberCategory.INVOKE_DECLARED_CONSTRUCTORS,
                MemberCategory.INVOKE_PUBLIC_METHODS,
                MemberCategory.INVOKE_DECLARED_METHODS,
                MemberCategory.DECLARED_FIELDS
            )
        }

        // springdoc MethodParameterPojoExtractor: RecordComponent.getAccessor()
        hints.reflection().registerType(
            TypeReference.of("java.lang.reflect.RecordComponent"),
            MemberCategory.INVOKE_DECLARED_CONSTRUCTORS,
            MemberCategory.INVOKE_PUBLIC_METHODS,
            MemberCategory.INVOKE_DECLARED_METHODS,
            MemberCategory.DECLARED_FIELDS
        )
        hints.reflection().registerType(
            TypeReference.of("java.lang.Class"),
            MemberCategory.INVOKE_DECLARED_METHODS,
            MemberCategory.INVOKE_PUBLIC_METHODS
        )
        listOf(
            "java.beans.Introspector",
            "java.beans.BeanInfo",
            "java.beans.PropertyDescriptor",
        ).forEach { name ->
            hints.reflection().registerType(
                TypeReference.of(name),
                MemberCategory.INVOKE_PUBLIC_METHODS,
                MemberCategory.INVOKE_DECLARED_CONSTRUCTORS
            )
        }
    }

    companion object {
        // Hibernate ORM 7.2.19.Final — regenerate from the jar when bumping Hibernate.
        val LOGGERS = listOf(
            "org.hibernate.action.internal.ActionLogging_\$logger",
            "org.hibernate.boot.BootLogging_\$logger",
            "org.hibernate.boot.archive.scan.internal.ScannerLogger_\$logger",
            "org.hibernate.boot.beanvalidation.BeanValidationLogger_\$logger",
            "org.hibernate.boot.jaxb.JaxbLogger_\$logger",
            "org.hibernate.bytecode.enhance.internal.BytecodeEnhancementLogging_\$logger",
            "org.hibernate.bytecode.enhance.spi.interceptor.BytecodeInterceptorLogging_\$logger",
            "org.hibernate.cache.spi.SecondLevelCacheLogger_\$logger",
            "org.hibernate.collection.internal.CollectionLogger_\$logger",
            "org.hibernate.context.internal.CurrentSessionLogging_\$logger",
            "org.hibernate.dialect.DialectLogging_\$logger",
            "org.hibernate.engine.internal.NaturalIdLogging_\$logger",
            "org.hibernate.engine.internal.PersistenceContextLogging_\$logger",
            "org.hibernate.engine.internal.SessionMetricsLogger_\$logger",
            "org.hibernate.engine.internal.VersionLogger_\$logger",
            "org.hibernate.engine.jdbc.JdbcLogging_\$logger",
            "org.hibernate.engine.jdbc.batch.JdbcBatchLogging_\$logger",
            "org.hibernate.engine.jdbc.connections.internal.ConnectionProviderLogging_\$logger",
            "org.hibernate.engine.jdbc.env.internal.LobCreationLogging_\$logger",
            "org.hibernate.engine.jdbc.spi.SQLExceptionLogging_\$logger",
            "org.hibernate.event.internal.EntityCopyLogging_\$logger",
            "org.hibernate.event.internal.EventListenerLogging_\$logger",
            "org.hibernate.id.UUIDLogger_\$logger",
            "org.hibernate.id.enhanced.OptimizerLogger_\$logger",
            "org.hibernate.id.enhanced.SequenceGeneratorLogger_\$logger",
            "org.hibernate.id.enhanced.TableGeneratorLogger_\$logger",
            "org.hibernate.internal.CoreMessageLogger_\$logger",
            "org.hibernate.internal.SessionFactoryLogging_\$logger",
            "org.hibernate.internal.SessionFactoryRegistryMessageLogger_\$logger",
            "org.hibernate.internal.SessionLogging_\$logger",
            "org.hibernate.internal.log.ConnectionAccessLogger_\$logger",
            "org.hibernate.internal.log.ConnectionInfoLogger_\$logger",
            "org.hibernate.internal.log.DeprecationLogger_\$logger",
            "org.hibernate.internal.log.IncubationLogger_\$logger",
            "org.hibernate.internal.log.StatisticsLogger_\$logger",
            "org.hibernate.internal.log.UrlMessageBundle_\$logger",
            "org.hibernate.jpa.internal.JpaLogger_\$logger",
            "org.hibernate.loader.ast.internal.MultiKeyLoadLogging_\$logger",
            "org.hibernate.metamodel.mapping.MappingModelCreationLogging_\$logger",
            "org.hibernate.query.QueryLogging_\$logger",
            "org.hibernate.query.hql.HqlLogging_\$logger",
            "org.hibernate.resource.beans.internal.BeansMessageLogger_\$logger",
            "org.hibernate.resource.jdbc.internal.LogicalConnectionLogging_\$logger",
            "org.hibernate.resource.jdbc.internal.ResourceRegistryLogger_\$logger",
            "org.hibernate.resource.transaction.backend.jta.internal.JtaLogging_\$logger",
            "org.hibernate.resource.transaction.internal.SynchronizationLogging_\$logger",
            "org.hibernate.service.internal.ServiceLogger_\$logger",
            "org.hibernate.sql.ast.tree.SqlAstTreeLogger_\$logger",
            "org.hibernate.sql.exec.SqlExecLogger_\$logger",
            "org.hibernate.sql.model.ModelMutationLogging_\$logger",
            "org.hibernate.sql.results.LoadingLogger_\$logger",
            "org.hibernate.sql.results.ResultsLogger_\$logger",
            "org.hibernate.sql.results.graph.embeddable.EmbeddableLoadingLogger_\$logger"
        )
    }
}

@Configuration
@ImportRuntimeHints(Hibernate72NativeHints::class)
class Hibernate72NativeConfiguration
