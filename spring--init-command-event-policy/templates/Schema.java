package {{basePackage}}.common.domainutils.{{context}};

import com.echarge.domainutil.schema.SchemaIdentifier;

/**
 * Identifies the {{context}} database schema/catalog for domain.util.
 *
 * Referenced by:
 *  - {{Context}}CommandInvoker  (passed to AbstractCommandInvoker)
 *  - {{Context}}DomainEventLogger (filters which events it persists)
 *  - @TargetSchema({{Context}}Schema.class) on every CommandHandler in this schema
 */
public enum {{Context}}Schema implements SchemaIdentifier {
    {{SCHEMA}};

    @Override
    public String schemaName() {
        return name().toLowerCase();
    }
}
